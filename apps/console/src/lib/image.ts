/** Shrinks a chosen picture to a JPEG data URL of at most about 100 KB (the API's limit). */
export async function shrinkImage(file: File, max = 360): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a picture file (PNG, JPEG or WebP).")
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const g = canvas.getContext("2d")!
  g.fillStyle = "#fff" // a transparent PNG would turn black as a JPEG
  g.fillRect(0, 0, canvas.width, canvas.height)
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  for (const q of [0.8, 0.65, 0.5, 0.35]) {
    const url = canvas.toDataURL("image/jpeg", q)
    if (url.length <= 130_000) return url
  }
  throw new Error("That picture is too detailed to shrink. Try a simpler one.")
}
