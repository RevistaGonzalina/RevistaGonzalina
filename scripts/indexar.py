#!/usr/bin/env python3
"""
Robot de la Revista Gonzalina.

Lee las carpetas `articulos/` y `fotos/` y genera:
  - data/contenido.js   -> lista de artículos y fotos que usa la página web
  - miniaturas/...      -> versiones livianas de las fotos (para que el muro cargue rápido)

Se ejecuta solo (GitHub Actions) cada vez que subes un artículo o una foto.
No necesitas tocar este archivo.
"""
import json
import re
import subprocess
import unicodedata
from datetime import date
from pathlib import Path

from PIL import Image, ImageOps

RAIZ = Path(__file__).resolve().parent.parent
CARPETA_ARTICULOS = RAIZ / "articulos"
CARPETA_FOTOS = RAIZ / "fotos"
CARPETA_MINIS = RAIZ / "miniaturas"
SALIDA = RAIZ / "data" / "contenido.js"

EXT_FOTOS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"}
CLAVES = {"titulo", "autor", "fecha", "resumen", "imagen"}
ANCHO_MINIATURA = 640

minis_usadas = set()


def sin_acentos(texto):
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")


def fechas_de_git():
    """Fecha (ISO) en que se subió cada archivo por primera vez."""
    try:
        salida = subprocess.run(
            ["git", "-c", "core.quotepath=false", "log", "--diff-filter=A", "--name-only",
             "--format=@@%cI", "--", "articulos", "fotos"],
            cwd=RAIZ, capture_output=True, text=True, check=True,
        ).stdout
    except Exception:
        return {}
    fechas, actual = {}, None
    for linea in salida.splitlines():
        if linea.startswith("@@"):
            actual = linea[2:]
        elif linea.strip():
            fechas[linea.strip()] = actual  # el log va de nuevo a viejo: gana la más antigua
    return fechas


def fecha_en_nombre(nombre):
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})(?=$|[\s_\-.])", nombre)
    return "-".join(m.groups()) if m else None


def fecha_valida(texto):
    texto = (texto or "").strip()
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", texto)
    if not m:
        m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", texto)
        if m:
            d, mes, a = m.groups()
            m = re.match(r"^(\d+)-(\d+)-(\d+)$", f"{a}-{mes}-{d}")
    if not m:
        return None
    try:
        a, mes, d = (int(x) for x in m.groups())
        return date(a, mes, d).isoformat()
    except ValueError:
        return None


def bonito(nombre):
    nombre = re.sub(r"^\d{4}-\d{2}-\d{2}[\s_\-.]*", "", nombre)
    nombre = re.sub(r"[-_]+", " ", nombre).strip()
    return nombre[:1].upper() + nombre[1:] if nombre else ""


# ---------------------------------------------------------------- miniaturas
def hacer_miniatura(rel):
    """Crea miniaturas/<rel>.jpg si hace falta. Devuelve la ruta relativa o None."""
    origen = RAIZ / rel
    destino_rel = f"miniaturas/{rel}.jpg"
    destino = RAIZ / destino_rel
    if origen.suffix.lower() == ".gif":
        return None
    if destino.exists():
        minis_usadas.add(destino.resolve())
        return destino_rel
    try:
        with Image.open(origen) as im:
            if getattr(im, "is_animated", False):
                return None
            im = ImageOps.exif_transpose(im)
            if im.mode in ("RGBA", "LA", "P"):
                im = im.convert("RGBA")
                fondo = Image.new("RGB", im.size, (255, 255, 255))
                fondo.paste(im, mask=im.split()[-1])
                im = fondo
            else:
                im = im.convert("RGB")
            im.thumbnail((ANCHO_MINIATURA, 4000), Image.LANCZOS)
            destino.parent.mkdir(parents=True, exist_ok=True)
            im.save(destino, "JPEG", quality=80, optimize=True, progressive=True)
    except Exception as error:
        print(f"  aviso: no pude crear miniatura de {rel}: {error}")
        return None
    minis_usadas.add(destino.resolve())
    return destino_rel


def medidas(ruta):
    try:
        with Image.open(ruta) as im:
            ancho, alto = im.size
            try:
                if im.getexif().get(274) in (5, 6, 7, 8):
                    ancho, alto = alto, ancho
            except Exception:
                pass
            return ancho, alto
    except Exception:
        return None, None


def limpiar_miniaturas_huerfanas():
    if not CARPETA_MINIS.exists():
        return
    for archivo in CARPETA_MINIS.rglob("*"):
        if archivo.is_file() and archivo.resolve() not in minis_usadas:
            archivo.unlink()
    for carpeta in sorted(CARPETA_MINIS.rglob("*"), reverse=True):
        if carpeta.is_dir() and not any(carpeta.iterdir()):
            carpeta.rmdir()


# ------------------------------------------------------------------ articulos
def partir_articulo(texto):
    texto = texto.lstrip("﻿").replace("\r\n", "\n").replace("\r", "\n").lstrip("\n")
    lineas = texto.split("\n")
    meta, i = {}, 0
    while i < len(lineas):
        m = re.match(r"^\s*([^\s:]+)\s*:\s*(.*)$", lineas[i])
        if not m:
            break
        clave = sin_acentos(m.group(1)).lower()
        if clave not in CLAVES:
            break
        meta[clave] = m.group(2).strip()
        i += 1
    return meta, "\n".join(lineas[i:]).strip("\n")


def resumen_automatico(cuerpo):
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", cuerpo)
    t = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", t)
    t = re.sub(r"^\s{0,3}(#{1,6}|>|[-*]|\d+[.)])\s*", "", t, flags=re.M)
    t = re.sub(r"[*_`]", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    if len(t) <= 200:
        return t
    return t[:200].rsplit(" ", 1)[0].rstrip(",.;:") + "…"


def leer_articulos(fechas):
    articulos = []
    if not CARPETA_ARTICULOS.exists():
        return articulos
    for archivo in sorted(CARPETA_ARTICULOS.rglob("*.md")):
        partes = archivo.relative_to(CARPETA_ARTICULOS).parts
        if len(partes) != 2:
            print(f"  aviso: {archivo.relative_to(RAIZ)} debe estar dentro de una carpeta de sección; lo ignoro")
            continue
        seccion, nombre_archivo = partes
        base = archivo.stem
        meta, cuerpo = partir_articulo(archivo.read_text(encoding="utf-8", errors="replace"))

        titulo = meta.get("titulo", "").strip()
        if not titulo:
            m = re.match(r"^\s*#\s+(.+)$", cuerpo.split("\n", 1)[0]) if cuerpo else None
            if m:
                titulo = m.group(1).strip()
                cuerpo = cuerpo.split("\n", 1)[1].strip("\n") if "\n" in cuerpo else ""
            else:
                titulo = bonito(base) or "Sin título"

        rel_git = archivo.relative_to(RAIZ).as_posix()
        fecha = (fecha_valida(meta.get("fecha")) or fecha_en_nombre(base)
                 or (fechas.get(rel_git) or "")[:10] or date.today().isoformat())

        imagen = meta.get("imagen", "").strip()
        imagen_mini = None
        if imagen and not re.match(r"^[a-z][a-z0-9+.-]*:", imagen, re.I):
            imagen = imagen.lstrip("/").removeprefix("./")
            if (RAIZ / imagen).is_file() and Path(imagen).suffix.lower() in EXT_FOTOS:
                imagen_mini = hacer_miniatura(imagen)
            elif not (RAIZ / imagen).is_file():
                print(f"  aviso: {rel_git} usa la imagen '{imagen}' pero no existe")

        articulos.append({
            "id": f"{seccion}/{base}",
            "seccion": seccion,
            "titulo": titulo,
            "autor": meta.get("autor", "").strip(),
            "fecha": fecha,
            "resumen": meta.get("resumen", "").strip() or resumen_automatico(cuerpo),
            "imagen": imagen,
            "imagenMini": imagen_mini,
            "texto": cuerpo,
        })
    articulos.sort(key=lambda a: (a["fecha"], a["id"]), reverse=True)
    return articulos


# ---------------------------------------------------------------------- fotos
def pie_de_foto(base):
    texto = bonito(base)
    if not texto or len(re.findall(r"[A-Za-zÁÉÍÓÚáéíóúÑñ]", texto)) < 3:
        return ""
    if re.match(r"^(img|dsc|dscn|dscf|pxl|mvimg|photo|foto|image|imagen|screenshot|captura|whatsapp image|wa)\b[\s_\-]*\d", texto, re.I):
        return ""
    if re.match(r"^[\d\s]+$", texto):
        return ""
    return texto


def leer_fotos(fechas):
    fotos = []
    if not CARPETA_FOTOS.exists():
        return fotos
    for archivo in sorted(CARPETA_FOTOS.iterdir()):
        if not archivo.is_file() or archivo.suffix.lower() not in EXT_FOTOS:
            continue
        rel = archivo.relative_to(RAIZ).as_posix()
        ancho, alto = medidas(archivo)
        fecha_hora = fechas.get(rel) or ""
        fecha = fecha_en_nombre(archivo.stem) or fecha_hora[:10] or date.today().isoformat()
        fotos.append({
            "archivo": archivo.name,
            "w": ancho,
            "h": alto,
            "mini": hacer_miniatura(rel),
            "fecha": fecha,
            "pie": pie_de_foto(archivo.stem),
            "_orden": fecha_hora,
        })
    fotos.sort(key=lambda f: (f["fecha"], f["_orden"], f["archivo"]), reverse=True)
    for f in fotos:
        del f["_orden"]
    return fotos


def main():
    fechas = fechas_de_git()
    CARPETA_MINIS.mkdir(exist_ok=True)
    articulos = leer_articulos(fechas)
    fotos = leer_fotos(fechas)
    limpiar_miniaturas_huerfanas()
    CARPETA_MINIS.mkdir(exist_ok=True)

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    contenido = json.dumps({"articulos": articulos, "fotos": fotos}, ensure_ascii=True, separators=(",", ":"))
    SALIDA.write_text(
        "// Archivo generado automáticamente por scripts/indexar.py. No lo edites a mano.\n"
        f"window.REVISTA_DATOS = {contenido};\n",
        encoding="utf-8",
    )
    print(f"Listo: {len(articulos)} artículo(s) y {len(fotos)} foto(s).")


if __name__ == "__main__":
    main()
