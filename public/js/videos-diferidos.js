// Los videos del combo solo se descargan cuando el visitante llega a ellos.
// Así quien entra desde el celular con datos no gasta megas de más.
const videosDiferidos = [...document.querySelectorAll("video.video-diferido")];

if (videosDiferidos.length) {
  const reproducir = (video) => {
    const intento = video.play();
    if (intento) intento.catch(() => { /* el navegador puede pedir un gesto */ });
  };

  const cargar = (video) => {
    if (video.dataset.cargado === "1") {
      reproducir(video);
      return;
    }
    video.querySelectorAll("source[data-src]").forEach((fuente) => {
      fuente.src = fuente.dataset.src;
      fuente.removeAttribute("data-src");
    });
    video.dataset.cargado = "1";
    video.load();
    reproducir(video);
  };

  // Sin IntersectionObserver cargamos todo, antes que dejar los videos vacíos.
  if (!("IntersectionObserver" in window)) {
    videosDiferidos.forEach(cargar);
  } else {
    const observador = new IntersectionObserver((entradas) => {
      entradas.forEach((entrada) => {
        if (entrada.isIntersecting) cargar(entrada.target);
        else if (!entrada.target.paused) entrada.target.pause();
      });
    }, { rootMargin: "200px 0px", threshold: 0.25 });
    videosDiferidos.forEach((video) => observador.observe(video));
  }
}
