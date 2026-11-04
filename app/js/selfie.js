// Optional selfie: shrink the photo on the phone, send it to our local server,
// get back a transparent Rabble person (SAM 3.1 + Muse Image, server-side).

const MAX_SIDE = 1024;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("couldn't read that photo"));
    img.src = src;
  });
}

async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function makeRabbleFromPhoto(file) {
  if (!file || !file.type.startsWith("image/")) throw new Error("that isn't a photo");
  const image = await shrink(file);
  let res;
  try {
    res = await fetch("api/selfie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    });
  } catch {
    throw new Error("couldn't reach the Rabble server");
  }
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.image) throw new Error(out.error || "couldn't make your Rabble person");
  return { img: await loadImage(out.image), figure: out.figure || null };
}
