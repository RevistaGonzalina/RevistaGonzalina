/* ==========================================================================
   REVISTA GONZALINA · código común del sitio
   --------------------------------------------------------------------------
   Aquí está TODO lo que hace funcionar el menú, los muros de artículos,
   el muro de fotos y el panel para publicar.

   Para agregar una sección nueva al menú, solo edita la lista "secciones"
   de la CONFIGURACIÓN (más abajo). Los textos de cada sección también se
   cambian ahí.
   ========================================================================== */
(function () {
    "use strict";

    /* ===================================================================
       CONFIGURACIÓN  (esto sí puedes editarlo)
       =================================================================== */
    var CONFIG = {
        // Tu repositorio de GitHub (sirve para los botones de "Publicar" y "Subir fotos")
        repo: "RevistaGonzalina/RevistaGonzalina",
        rama: "main",

        // Cuántos artículos se muestran cada vez y cuántas fotos se cargan por tanda
        articulosPorPagina: 6,
        fotosPorTanda: 18,

        // Secciones del menú. "tipo" puede ser: "inicio", "articulos" o "fotos".
        // Para las de tipo "articulos", "id" es también el nombre de la carpeta
        // dentro de /articulos/ donde viven sus artículos.
        secciones: [
            { id: "inicio", titulo: "Inicio", url: "index.html", tipo: "inicio" },
            {
                id: "apoyo", titulo: "Conciencia y apoyo", url: "apoyo.html", tipo: "articulos",
                descripcion: "Artículos sobre las problemáticas que vivimos como estudiantes y sobre cómo podemos apoyarnos entre compañeros."
            },
            {
                id: "logros", titulo: "Logros", url: "logros.html", tipo: "articulos",
                descripcion: "Reconocimientos, premios y metas alcanzadas por estudiantes, cursos y por todo nuestro plantel."
            },
            {
                id: "cultura", titulo: "Cultura estudiantil", url: "cultura.html", tipo: "articulos",
                descripcion: "Arte, deportes, tradiciones y la vida diaria dentro y fuera de las aulas."
            },
            {
                id: "galeria", titulo: "Galería", url: "galeria.html", tipo: "fotos",
                descripcion: "Un muro de fotos que nunca termina: sigue bajando y descubre más momentos de nuestra comunidad."
            }
        ]
    };

    /* ===================================================================
       DE AQUÍ PARA ABAJO NO HACE FALTA EDITAR
       =================================================================== */
    var DATOS = window.REVISTA_DATOS || { articulos: [], fotos: [] };
    DATOS.articulos = DATOS.articulos || [];
    DATOS.fotos = DATOS.fotos || [];

    var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
        "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

    /* ---------- utilidades ---------- */
    function $(sel, raiz) { return (raiz || document).querySelector(sel); }

    function esc(t) {
        return String(t == null ? "" : t)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function normalizar(t) {
        return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    }

    function formatoFecha(iso) {
        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
        if (!m) return "";
        return parseInt(m[3], 10) + " de " + MESES[parseInt(m[2], 10) - 1] + " de " + m[1];
    }

    function buscarSeccion(id) {
        for (var i = 0; i < CONFIG.secciones.length; i++) {
            if (CONFIG.secciones[i].id === id) return CONFIG.secciones[i];
        }
        return null;
    }

    // Codifica una ruta de archivo (con espacios, tildes...) sin romper las barras
    function rutaArchivo(ruta) {
        return String(ruta).split("/").map(function (parte) {
            try { return encodeURIComponent(decodeURIComponent(parte)); }
            catch (e) { return encodeURIComponent(parte); }
        }).join("/");
    }

    function esExterna(u) { return /^[a-z][a-z0-9+.-]*:/i.test(u) || u.indexOf("//") === 0; }

    function urlImagen(ruta) {
        if (!ruta) return "";
        return esExterna(ruta) ? ruta : rutaArchivo(ruta);
    }

    // Solo permite enlaces http, https, mailto y rutas internas
    function urlSegura(u) {
        u = String(u || "").trim();
        if (!u) return "";
        if (/^[a-z][a-z0-9+.-]*:/i.test(u) && !/^(https?:|mailto:)/i.test(u)) return "";
        return u;
    }

    function enlaceArticulo(a) { return "articulo.html?a=" + encodeURIComponent(a.id); }

    function ordenarPorFecha(lista) {
        return lista.slice().sort(function (x, y) {
            if (x.fecha !== y.fecha) return x.fecha < y.fecha ? 1 : -1;
            return x.id < y.id ? 1 : -1;
        });
    }

    /* ---------- Markdown sencillo (negrita, títulos, listas, citas, imágenes, enlaces) ---------- */
    function enLinea(texto) {
        var guardados = [];
        function guardar(html) { guardados.push(html); return "\u0000" + (guardados.length - 1) + "\u0000"; }

        var s = texto;
        s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, alt, url) {
            var u = urlSegura(url);
            if (!u) return m;
            return guardar('<img src="' + urlImagen(u) + '" alt="' + alt + '" class="image-deco" loading="lazy">');
        });
        s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, txt, url) {
            var u = urlSegura(url);
            if (!u) return txt;
            var externo = /^https?:/i.test(u);
            var destino = externo ? u : (/^mailto:|^#/i.test(u) ? u : rutaArchivo(u));
            return guardar('<a href="' + destino + '"' + (externo ? ' target="_blank" rel="noopener"' : "") + ">" + txt + "</a>");
        });
        s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        s = s.replace(/(^|[\s(¿¡])\*([^*\s][^*]*?)\*/g, "$1<em>$2</em>");
        s = s.replace(/(^|[\s(¿¡])_([^_\s][^_]*?)_/g, "$1<em>$2</em>");
        return s.replace(/\u0000(\d+)\u0000/g, function (m, i) { return guardados[+i]; });
    }

    function parrafoHtml(lineas) {
        return lineas.map(function (l) { return enLinea(esc(l)); }).join("<br>");
    }

    function markdown(fuente) {
        var lineas = String(fuente || "").replace(/\r\n?/g, "\n").split("\n");
        var salida = [], i = 0, m;
        var esVacia = function (l) { return /^\s*$/.test(l); };
        var esBloque = function (l) {
            return /^#{1,3}\s+/.test(l) || /^>\s?/.test(l) || /^\s*[-*]\s+/.test(l) ||
                /^\s*\d+[.)]\s+/.test(l) || /^\s*([-*_])\1{2,}\s*$/.test(l);
        };

        while (i < lineas.length) {
            var l = lineas[i];
            if (esVacia(l)) { i++; continue; }

            if ((m = /^(#{1,3})\s+(.*)$/.exec(l))) {
                var n = m[1].length + 1;
                salida.push("<h" + n + ">" + enLinea(esc(m[2].trim())) + "</h" + n + ">");
                i++; continue;
            }
            if (/^\s*([-*_])\1{2,}\s*$/.test(l)) { salida.push("<hr>"); i++; continue; }

            if (/^>\s?/.test(l)) {
                var cita = [];
                while (i < lineas.length && /^>\s?/.test(lineas[i])) { cita.push(lineas[i].replace(/^>\s?/, "")); i++; }
                salida.push("<blockquote>" + parrafoHtml(cita) + "</blockquote>");
                continue;
            }
            if (/^\s*[-*]\s+/.test(l)) {
                var items = [];
                while (i < lineas.length && /^\s*[-*]\s+/.test(lineas[i])) { items.push(lineas[i].replace(/^\s*[-*]\s+/, "")); i++; }
                salida.push("<ul>" + items.map(function (t) { return "<li>" + enLinea(esc(t)) + "</li>"; }).join("") + "</ul>");
                continue;
            }
            if (/^\s*\d+[.)]\s+/.test(l)) {
                var nums = [];
                while (i < lineas.length && /^\s*\d+[.)]\s+/.test(lineas[i])) { nums.push(lineas[i].replace(/^\s*\d+[.)]\s+/, "")); i++; }
                salida.push("<ol>" + nums.map(function (t) { return "<li>" + enLinea(esc(t)) + "</li>"; }).join("") + "</ol>");
                continue;
            }

            var parrafo = [];
            while (i < lineas.length && !esVacia(lineas[i]) && (parrafo.length === 0 || !esBloque(lineas[i]))) {
                parrafo.push(lineas[i]); i++;
            }
            salida.push("<p>" + parrafoHtml(parrafo) + "</p>");
        }
        return salida.join("\n");
    }

    /* ---------- menú lateral ---------- */
    function pintarMenu(actual) {
        var nav = document.getElementById("menu");
        if (!nav) return;
        nav.innerHTML = CONFIG.secciones.map(function (s) {
            var activo = s.id === actual;
            return '<a href="' + esc(s.url) + '"' + (activo ? ' class="activo" aria-current="page"' : "") + ">" + esc(s.titulo) + "</a>";
        }).join("");
    }

    /* ---------- selector de letra (igual que en la plantilla) ---------- */
    function iniciarFuente() {
        var selector = document.getElementById("fontFamily");
        if (!selector) return;
        var guardada = null;
        try { guardada = localStorage.getItem("fontFamily"); } catch (e) { /* sin almacenamiento */ }
        function aplicar(valor) {
            document.body.style.fontFamily = valor;
            var lado = document.getElementById("sidebar");
            if (lado) lado.style.fontFamily = valor;
        }
        if (guardada) { selector.value = guardada; aplicar(guardada); }
        selector.onchange = function () {
            try { localStorage.setItem("fontFamily", selector.value); } catch (e) { /* ignorar */ }
            aplicar(selector.value);
        };
    }

    /* ---------- tarjetas de artículos ---------- */
    function metaArticulo(a, conSeccion) {
        var partes = [];
        if (a.fecha) partes.push(esc(formatoFecha(a.fecha)));
        if (a.autor) partes.push("Por " + esc(a.autor));
        if (conSeccion) {
            var s = buscarSeccion(a.seccion);
            if (s) partes.push('<a href="' + esc(s.url) + '">' + esc(s.titulo) + "</a>");
        }
        return partes.join(" · ");
    }

    function tarjetaArticulo(a, conSeccion) {
        var sec = document.createElement("section");
        var foto = a.imagenMini || a.imagen;
        sec.className = "entrada" + (foto ? "" : " sin-imagen");
        sec.innerHTML =
            (foto ? '<a class="entrada-img" href="' + enlaceArticulo(a) + '" tabindex="-1" aria-hidden="true">' +
                '<img src="' + urlImagen(foto) + '" alt="" loading="lazy"></a>' : "") +
            '<div class="entrada-texto">' +
            '<h2 class="entrada-titulo"><a href="' + enlaceArticulo(a) + '">' + esc(a.titulo) + "</a></h2>" +
            '<p class="entrada-meta">' + metaArticulo(a, conSeccion) + "</p>" +
            (a.resumen ? "<p>" + esc(a.resumen) + "</p>" : "") +
            '<p><a class="leer-mas" href="' + enlaceArticulo(a) + '">Leer artículo →</a></p>' +
            "</div>";
        return sec;
    }

    /* ===================================================================
       PÁGINA: SECCIÓN DE ARTÍCULOS  (muro de blog)
       =================================================================== */
    function iniciarSeccion() {
        var id = document.body.getAttribute("data-seccion");
        var sec = buscarSeccion(id) || { id: id, titulo: id, descripcion: "" };
        pintarMenu(id);
        document.title = sec.titulo + " · Revista Gonzalina";

        $("#sec-titulo").textContent = sec.titulo;
        $("#sec-desc").textContent = sec.descripcion || "";

        var main = document.getElementById("content");
        var ancla = document.getElementById("muro-ancla");
        var boton = document.getElementById("mas");
        var buscador = document.getElementById("buscar");
        var estado = document.getElementById("muro-estado");

        var todos = ordenarPorFecha(DATOS.articulos.filter(function (a) { return a.seccion === id; }));
        var filtrados = todos, mostrados = 0;

        function limpiar() {
            var viejas = main.querySelectorAll("section.entrada, section.vacio");
            for (var i = 0; i < viejas.length; i++) viejas[i].parentNode.removeChild(viejas[i]);
        }

        function cargarMas() {
            var hasta = Math.min(mostrados + CONFIG.articulosPorPagina, filtrados.length);
            for (; mostrados < hasta; mostrados++) main.insertBefore(tarjetaArticulo(filtrados[mostrados], false), ancla);
            boton.hidden = mostrados >= filtrados.length;
            estado.textContent = filtrados.length
                ? "Mostrando " + mostrados + " de " + filtrados.length + (filtrados.length === 1 ? " artículo" : " artículos")
                : "";
        }

        function mostrarVacio(texto) {
            var v = document.createElement("section");
            v.className = "vacio";
            v.innerHTML = "<p>" + texto + "</p>";
            main.insertBefore(v, ancla);
        }

        function dibujar() {
            limpiar();
            mostrados = 0;
            if (!filtrados.length) {
                boton.hidden = true;
                estado.textContent = "";
                mostrarVacio(todos.length
                    ? "No encontramos artículos con esa búsqueda."
                    : "Todavía no hay artículos en esta sección. ¡Muy pronto habrá novedades!");
                return;
            }
            cargarMas();
        }

        boton.addEventListener("click", cargarMas);
        buscador.addEventListener("input", function () {
            var q = normalizar(buscador.value).trim();
            filtrados = !q ? todos : todos.filter(function (a) {
                return normalizar([a.titulo, a.autor, a.resumen, a.texto].join(" ")).indexOf(q) !== -1;
            });
            dibujar();
        });
        if (!todos.length) buscador.parentNode.hidden = true;
        dibujar();
    }

    /* ===================================================================
       PÁGINA: UN ARTÍCULO
       =================================================================== */
    function iniciarArticulo() {
        var idPedido = new URLSearchParams(location.search).get("a") || "";
        var art = null;
        for (var i = 0; i < DATOS.articulos.length; i++) {
            if (DATOS.articulos[i].id === idPedido) { art = DATOS.articulos[i]; break; }
        }
        var cont = document.getElementById("articulo");

        if (!art) {
            pintarMenu("");
            document.title = "Artículo no encontrado · Revista Gonzalina";
            cont.innerHTML = '<h1>No encontramos este artículo</h1>' +
                '<p>Puede que el enlace esté incompleto o que el artículo ya no esté publicado.</p>' +
                '<p><a href="index.html">← Volver al inicio</a></p>';
            return;
        }

        var sec = buscarSeccion(art.seccion);
        pintarMenu(art.seccion);
        document.title = art.titulo + " · Revista Gonzalina";
        var desc = document.querySelector('meta[name="description"]');
        if (desc && art.resumen) desc.setAttribute("content", art.resumen);

        cont.innerHTML =
            '<p class="volver"><a href="' + esc(sec ? sec.url : "index.html") + '">← ' +
            esc(sec ? sec.titulo : "Volver al inicio") + "</a></p>" +
            "<h1>" + esc(art.titulo) + "</h1>" +
            '<p class="entrada-meta centrado">' + metaArticulo(art, false) + "</p>" +
            (art.imagen ? '<img class="portada image-deco" src="' + urlImagen(art.imagen) + '" alt="">' : "") +
            '<div class="articulo-cuerpo">' + markdown(art.texto) + "</div>";

        var relacionados = ordenarPorFecha(DATOS.articulos.filter(function (a) {
            return a.seccion === art.seccion && a.id !== art.id;
        })).slice(0, 3);
        var otro = document.getElementById("relacionados");
        if (relacionados.length && otro) {
            otro.hidden = false;
            var lista = $(".relacionados-lista", otro);
            relacionados.forEach(function (a) {
                var li = document.createElement("li");
                li.innerHTML = '<a href="' + enlaceArticulo(a) + '">' + esc(a.titulo) + "</a> <small>" + esc(formatoFecha(a.fecha)) + "</small>";
                lista.appendChild(li);
            });
        }
    }

    /* ===================================================================
       PÁGINA: GALERÍA  (muro de fotos con scroll infinito)
       =================================================================== */
    function iniciarGaleria() {
        pintarMenu("galeria");
        var sec = buscarSeccion("galeria") || {};
        document.title = (sec.titulo || "Galería") + " · Revista Gonzalina";
        $("#sec-titulo").textContent = sec.titulo || "Galería";
        $("#sec-desc").textContent = sec.descripcion || "";

        var fotos = DATOS.fotos;
        var muro = document.getElementById("fotos");
        var centinela = document.getElementById("centinela");
        var estado = document.getElementById("fotos-estado");
        var vacio = document.getElementById("fotos-vacio");

        if (!fotos.length) {
            muro.hidden = true; centinela.hidden = true; vacio.hidden = false;
            return;
        }

        var consulta = window.matchMedia("(max-width: 800px)");
        var columnas = [], alturas = [], mostradas = 0, observador = null;

        function numeroColumnas() { return consulta.matches ? 2 : 3; }

        function urlOriginal(f) { return "fotos/" + rutaArchivo(f.archivo); }
        function urlMini(f) { return f.mini ? rutaArchivo(f.mini) : urlOriginal(f); }

        function crearFigura(f, idx) {
            var fig = document.createElement("figure");
            fig.className = "foto";
            var ratio = f.w && f.h ? f.w + "/" + f.h : "1/1";
            fig.innerHTML =
                '<button type="button" class="foto-btn" data-i="' + idx + '" aria-label="Ampliar foto' + (f.pie ? ": " + esc(f.pie) : "") + '">' +
                '<img src="' + urlMini(f) + '" alt="' + esc(f.pie) + '" loading="lazy" decoding="async"' +
                (f.w && f.h ? ' width="' + f.w + '" height="' + f.h + '"' : "") +
                ' style="aspect-ratio:' + ratio + '"></button>' +
                (f.pie ? "<figcaption>" + esc(f.pie) + "</figcaption>" : "");
            return fig;
        }

        function colocar(idx) {
            var f = fotos[idx], menor = 0;
            for (var k = 1; k < alturas.length; k++) if (alturas[k] < alturas[menor]) menor = k;
            var ratio = f.w && f.h ? f.h / f.w : 1;
            alturas[menor] += ratio + 0.1 + (f.pie ? 0.12 : 0);
            columnas[menor].appendChild(crearFigura(f, idx));
        }

        function armar() {
            muro.innerHTML = "";
            columnas = []; alturas = [];
            for (var c = 0; c < numeroColumnas(); c++) {
                var col = document.createElement("div");
                col.className = "fotos-col";
                muro.appendChild(col);
                columnas.push(col); alturas.push(0);
            }
            for (var i = 0; i < mostradas; i++) colocar(i);
        }

        function actualizarEstado() {
            estado.textContent = mostradas >= fotos.length
                ? "Eso es todo por ahora (" + fotos.length + (fotos.length === 1 ? " foto" : " fotos") + "). Vuelve pronto: el muro sigue creciendo."
                : "Cargando más fotos…";
        }

        function cargarTanda() {
            if (mostradas >= fotos.length) return;
            var hasta = Math.min(mostradas + CONFIG.fotosPorTanda, fotos.length);
            for (; mostradas < hasta; mostradas++) colocar(mostradas);
            actualizarEstado();
            if (observador) { observador.unobserve(centinela); if (mostradas < fotos.length) observador.observe(centinela); }
        }

        consulta.addEventListener
            ? consulta.addEventListener("change", armar)
            : consulta.addListener(armar);

        armar();
        if ("IntersectionObserver" in window) {
            observador = new IntersectionObserver(function (entradas) {
                if (entradas[0].isIntersecting) cargarTanda();
            }, { rootMargin: "900px 0px" });
            observador.observe(centinela);
        } else {
            while (mostradas < fotos.length) cargarTanda();
        }
        cargarTanda();

        /* --- visor ampliado --- */
        var visor = document.getElementById("visor");
        var visorImg = $("#visor-img");
        var visorPie = $("#visor-pie");
        var actual = 0, previoFoco = null;

        function abrir(idx) {
            actual = (idx + fotos.length) % fotos.length;
            var f = fotos[actual];
            visorImg.src = urlOriginal(f);
            visorImg.alt = f.pie || "";
            visorPie.textContent = (f.pie ? f.pie + " · " : "") + formatoFecha(f.fecha);
            if (visor.hidden) {
                previoFoco = document.activeElement;
                visor.hidden = false;
                $("#visor-cerrar").focus();
            }
        }
        function cerrar() {
            visor.hidden = true;
            visorImg.removeAttribute("src");
            if (previoFoco && previoFoco.focus) previoFoco.focus();
        }

        muro.addEventListener("click", function (e) {
            var b = e.target.closest ? e.target.closest(".foto-btn") : null;
            if (b) abrir(parseInt(b.getAttribute("data-i"), 10));
        });
        $("#visor-cerrar").addEventListener("click", cerrar);
        $("#visor-ant").addEventListener("click", function () { abrir(actual - 1); });
        $("#visor-sig").addEventListener("click", function () { abrir(actual + 1); });
        visor.addEventListener("click", function (e) { if (e.target === visor) cerrar(); });
        document.addEventListener("keydown", function (e) {
            if (visor.hidden) return;
            if (e.key === "Escape") cerrar();
            else if (e.key === "ArrowLeft") abrir(actual - 1);
            else if (e.key === "ArrowRight") abrir(actual + 1);
        });
    }

    /* ===================================================================
       PÁGINA DE INICIO: "lo más nuevo"
       =================================================================== */
    function iniciarInicio() {
        pintarMenu("inicio");
        var arts = document.getElementById("ultimos-articulos");
        var fotos = document.getElementById("ultimas-fotos");

        if (arts) {
            var recientes = ordenarPorFecha(DATOS.articulos).slice(0, 3);
            arts.innerHTML = recientes.length
                ? recientes.map(function (a) {
                    return '<div class="ultimo"><h3><a href="' + enlaceArticulo(a) + '">' + esc(a.titulo) + "</a></h3>" +
                        '<p class="entrada-meta">' + metaArticulo(a, true) + "</p>" +
                        (a.resumen ? "<p>" + esc(a.resumen) + "</p>" : "") + "</div>";
                }).join("")
                : "<p>Pronto publicaremos aquí los primeros artículos.</p>";
        }
        if (fotos) {
            var nuevas = DATOS.fotos.slice(0, 5);
            if (nuevas.length) {
                fotos.innerHTML = nuevas.map(function (f) {
                    return '<div><a href="galeria.html"><img alt="' + esc(f.pie) + '" loading="lazy" src="' +
                        (f.mini ? rutaArchivo(f.mini) : "fotos/" + rutaArchivo(f.archivo)) + '"></a></div>';
                }).join("");
            } else {
                fotos.outerHTML = "<p>Pronto verás aquí las últimas fotos del muro.</p>";
            }
        }
    }

    /* ===================================================================
       PÁGINA: PANEL PARA PUBLICAR (solo el equipo)
       =================================================================== */
    function hacerSlug(t) {
        var s = normalizar(t).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, "");
        return s || "articulo";
    }

    function hoyISO() {
        var d = new Date();
        return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    }

    function copiarTexto(texto) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(texto);
        }
        return new Promise(function (ok, fallo) {
            var t = document.createElement("textarea");
            t.value = texto; t.style.position = "fixed"; t.style.opacity = "0";
            document.body.appendChild(t); t.select();
            try { document.execCommand("copy") ? ok() : fallo(); } catch (e) { fallo(e); }
            document.body.removeChild(t);
        });
    }

    function iniciarPublicar() {
        pintarMenu("");
        var gh = "https://github.com/" + CONFIG.repo;
        var campos = {
            seccion: $("#p-seccion"), titulo: $("#p-titulo"), autor: $("#p-autor"), fecha: $("#p-fecha"),
            resumen: $("#p-resumen"), imagen: $("#p-imagen"), texto: $("#p-texto")
        };
        var aviso = $("#p-aviso");

        CONFIG.secciones.filter(function (s) { return s.tipo === "articulos"; }).forEach(function (s) {
            var o = document.createElement("option");
            o.value = s.id; o.textContent = s.titulo;
            campos.seccion.appendChild(o);
        });
        campos.fecha.value = hoyISO();

        $("#p-link-fotos").href = gh + "/upload/" + CONFIG.rama + "/fotos";
        $("#p-link-imagenes").href = gh + "/upload/" + CONFIG.rama + "/img/articulos";
        $("#p-link-repo").href = gh;

        function unaLinea(v) { return String(v || "").replace(/\s*\n\s*/g, " ").trim(); }

        function construir() {
            var cab = [];
            if (unaLinea(campos.titulo.value)) cab.push("titulo: " + unaLinea(campos.titulo.value));
            if (unaLinea(campos.autor.value)) cab.push("autor: " + unaLinea(campos.autor.value));
            if (unaLinea(campos.fecha.value)) cab.push("fecha: " + unaLinea(campos.fecha.value));
            if (unaLinea(campos.resumen.value)) cab.push("resumen: " + unaLinea(campos.resumen.value));
            if (unaLinea(campos.imagen.value)) cab.push("imagen: " + unaLinea(campos.imagen.value));
            var contenido = cab.join("\n") + "\n\n" + campos.texto.value.replace(/\s+$/, "") + "\n";
            var fecha = /^\d{4}-\d{2}-\d{2}$/.test(campos.fecha.value) ? campos.fecha.value : hoyISO();
            var nombre = fecha + "-" + hacerSlug(campos.titulo.value) + ".md";
            return { ruta: "articulos/" + campos.seccion.value + "/" + nombre, nombre: nombre, contenido: contenido };
        }

        function vistaPrevia() {
            var a = {
                id: "previa", seccion: campos.seccion.value, titulo: campos.titulo.value || "Título del artículo",
                autor: campos.autor.value, fecha: campos.fecha.value, resumen: campos.resumen.value,
                imagen: campos.imagen.value.trim()
            };
            var cont = $("#p-previa");
            cont.innerHTML =
                "<h1>" + esc(a.titulo) + "</h1>" +
                '<p class="entrada-meta centrado">' + metaArticulo(a, false) + "</p>" +
                (a.imagen ? '<img class="portada image-deco" src="' + urlImagen(a.imagen) + '" alt="">' : "") +
                '<div class="articulo-cuerpo">' + (campos.texto.value.trim() ? markdown(campos.texto.value) :
                    "<p><em>Aquí verás cómo se verá tu texto mientras lo escribes.</em></p>") + "</div>";
        }

        function mostrarAviso(t) { aviso.textContent = t; aviso.hidden = !t; }

        function validar() {
            if (!campos.titulo.value.trim()) { mostrarAviso("Escribe primero el título del artículo."); campos.titulo.focus(); return false; }
            if (!campos.texto.value.trim()) { mostrarAviso("Escribe el texto del artículo."); campos.texto.focus(); return false; }
            mostrarAviso("");
            return true;
        }

        $("#p-publicar").addEventListener("click", function () {
            if (!validar()) return;
            var r = construir();
            var base = gh + "/new/" + CONFIG.rama + "?filename=" + encodeURIComponent(r.ruta);
            var url = base + "&value=" + encodeURIComponent(r.contenido);
            if (url.length > 7000) {
                copiarTexto(r.contenido).then(function () {
                    mostrarAviso("Tu artículo es largo, así que lo copiamos al portapapeles. En la página de GitHub que se abre, haz clic en el cuadro grande y pega con Ctrl+V (o ⌘+V). Luego pulsa «Commit changes».");
                }, function () {
                    mostrarAviso("Tu artículo es largo y no pudimos copiarlo solo. Pulsa «Copiar texto» aquí, vuelve a la página de GitHub que se abrió y pégalo en el cuadro grande.");
                });
                window.open(base, "_blank", "noopener");
            } else {
                mostrarAviso("Se abrió GitHub con tu artículo listo. Solo falta pulsar el botón verde «Commit changes…» y confirmar. En un minuto aparecerá en la revista.");
                window.open(url, "_blank", "noopener");
            }
        });

        $("#p-copiar").addEventListener("click", function () {
            if (!validar()) return;
            copiarTexto(construir().contenido).then(
                function () { mostrarAviso("Texto copiado. Guárdalo en un archivo .md dentro de la carpeta articulos/" + campos.seccion.value + "/"); },
                function () { mostrarAviso("No pude copiar automáticamente. Selecciona el texto a mano."); }
            );
        });

        $("#p-descargar").addEventListener("click", function () {
            if (!validar()) return;
            var r = construir();
            var blob = new Blob([r.contenido], { type: "text/markdown;charset=utf-8" });
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = r.nombre;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
            mostrarAviso("Archivo descargado: " + r.nombre + ". Súbelo a la carpeta articulos/" + campos.seccion.value + "/ del repositorio.");
        });

        Object.keys(campos).forEach(function (k) {
            campos[k].addEventListener("input", vistaPrevia);
            campos[k].addEventListener("change", vistaPrevia);
        });
        vistaPrevia();
    }

    /* ===================================================================
       ARRANQUE
       =================================================================== */
    function arrancar() {
        iniciarFuente();
        var pagina = document.body.getAttribute("data-pagina");
        if (pagina === "inicio") iniciarInicio();
        else if (pagina === "seccion") iniciarSeccion();
        else if (pagina === "galeria") iniciarGaleria();
        else if (pagina === "articulo") iniciarArticulo();
        else if (pagina === "publicar") iniciarPublicar();
        else pintarMenu("");
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
    else arrancar();
})();
