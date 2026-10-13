/*
 * College-branded event pass PDF exporter.
 * Builds a self-contained SVG card with the same soft purple/mauve/peach gradient
 * as the on-screen DigitalPass and embeds it as a high-resolution image in a PDF.
 * No external PDF/canvas package is required.
 */

const PAGE_W = 1000;
const PAGE_H = 1414;

const xmlEscape = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

function formatPassDate(value) {
  if (!value) return "Date to be announced";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric"
  });
}

function wrapText(value, maxChars, maxLines = 2) {
  const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return ["—"];
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = next;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  const consumed = lines.join(" ").length;
  const original = words.join(" ");
  if (consumed < original.length && lines.length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/[.…]*$/, "") + "…";
  }
  return lines;
}

function textBlock(value, x, y, { size = 26, color = "#ffffff", weight = 500, maxChars = 60, maxLines = 2, lineHeight = 1.35, anchor = "start", letterSpacing = 0 } = {}) {
  const lines = wrapText(value, maxChars, maxLines);
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${letterSpacing}">${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : size * lineHeight}">${xmlEscape(line)}</tspan>`).join("")}</text>`;
}

async function imageToDataUri(url) {
  try {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function getCollegeLogo() {
  const candidates = ["/college-logo.png", "/college-footer-logo.png"];
  for (const path of candidates) {
    const data = await imageToDataUri(new URL(path, window.location.origin).href);
    if (data) return data;
  }
  return null;
}

function detailCard({ x, y, w, h, label, value, lines = 2 }) {
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="#ffffff" fill-opacity=".135" stroke="#ffffff" stroke-opacity=".32" stroke-width="1.5"/>
      <text x="${x + 24}" y="${y + 33}" fill="#fff5f0" fill-opacity=".88" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700" letter-spacing="2">${xmlEscape(label)}</text>
      ${textBlock(value || "—", x + 24, y + 73, { size: 25, weight: 700, maxChars: Math.floor((w - 48) / 13), maxLines: lines, lineHeight: 1.25 })}
    </g>`;
}

async function makePassSvg(event = {}, registration = {}) {
  const logoData = await getCollegeLogo();
  const title = event.title || registration.eventTitle || "Campus Event";
  const description = event.description || registration.eventDescription || "Your campus fest experience starts here.";
  const date = formatPassDate(event.date || registration.eventDate);
  const time = event.time || registration.eventTime || "Time to be announced";
  const venue = event.venue || registration.eventVenue || "Venue to be announced";
  const student = registration.name || "Registered student";
  const roll = registration.rollNumber || registration.pin || "—";
  const passId = registration.passId || registration.id || "Confirmed";
  const category = event.category || registration.eventCategory || "Campus Event";
  const descLines = wrapText(description, 72, 3);

  const logoMarkup = logoData
    ? `<image href="${logoData}" x="70" y="68" width="92" height="92" preserveAspectRatio="xMidYMid meet"/>`
    : `<circle cx="116" cy="114" r="46" fill="#ffffff"/><text x="116" y="124" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="800" fill="#6d559e">SBSP</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">
    <defs>
      <linearGradient id="passGradient" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#5d4b9a"/><stop offset="48%" stop-color="#9a6db1"/><stop offset="100%" stop-color="#e9a3a0"/>
      </linearGradient>
      <linearGradient id="headerGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".2"/><stop offset="1" stop-color="#ffffff" stop-opacity=".035"/></linearGradient>
      <linearGradient id="detailGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#493568" stop-opacity=".48"/><stop offset="1" stop-color="#9d5c77" stop-opacity=".25"/></linearGradient>
      <radialGradient id="glowTop"><stop offset="0" stop-color="#fff" stop-opacity=".30"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <radialGradient id="glowBottom"><stop offset="0" stop-color="#ffdfc9" stop-opacity=".28"/><stop offset="1" stop-color="#ffdfc9" stop-opacity="0"/></radialGradient>
      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#392653" flood-opacity=".24"/></filter>
      <clipPath id="roundedClip"><rect x="30" y="30" width="940" height="1354" rx="38"/></clipPath>
    </defs>
    <rect width="${PAGE_W}" height="${PAGE_H}" fill="#f7f3fb"/>
    <g filter="url(#softShadow)">
      <rect x="30" y="30" width="940" height="1354" rx="38" fill="url(#passGradient)"/>
    </g>
    <g clip-path="url(#roundedClip)">
      <ellipse cx="875" cy="140" rx="310" ry="280" fill="url(#glowTop)"/>
      <ellipse cx="120" cy="1280" rx="350" ry="280" fill="url(#glowBottom)"/>
      <circle cx="860" cy="680" r="198" fill="none" stroke="#ffffff" stroke-opacity=".13" stroke-width="2"/>
      <circle cx="860" cy="680" r="153" fill="none" stroke="#ffffff" stroke-opacity=".08" stroke-width="2"/>
      <circle cx="845" cy="1010" r="250" fill="none" stroke="#ffffff" stroke-opacity=".055" stroke-width="2"/>
      <path d="M560 0 C690 145 845 170 1000 120 L1000 360 C820 385 715 295 560 220 Z" fill="#ffffff" fill-opacity=".055"/>
      <path d="M0 1130 C170 1070 245 1220 330 1414 L0 1414 Z" fill="#ffe3d6" fill-opacity=".12"/>
      <path d="M725 0 C780 180 930 235 1000 220" fill="none" stroke="#ffffff" stroke-opacity=".18" stroke-width="2"/>
      <g fill="#fff" fill-opacity=".65"><circle cx="806" cy="315" r="4"/><circle cx="900" cy="380" r="6"/><circle cx="755" cy="540" r="4"/><circle cx="910" cy="810" r="5"/><circle cx="824" cy="1150" r="4"/><circle cx="170" cy="1070" r="5"/></g>
      <rect x="30" y="30" width="940" height="202" fill="url(#headerGlass)"/>
      ${logoMarkup}
      <text x="184" y="92" fill="#fff8fb" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="800" letter-spacing="2.3">SMT. B. SEETHA POLYTECHNIC</text>
      <text x="184" y="138" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="800" letter-spacing="2">FEST CLUB</text>
      <text x="184" y="172" fill="#ffffff" fill-opacity=".82" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="600" letter-spacing="1.8">COLLEGE FESTIVAL · OFFICIAL PASS</text>
      <rect x="742" y="75" width="188" height="48" rx="24" fill="#ffffff" fill-opacity=".17" stroke="#ffffff" stroke-opacity=".44"/>
      <text x="836" y="105" fill="#ffffff" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="800" letter-spacing="1.1">✓ CONFIRMED</text>
      <path d="M56 232 H944" stroke="#ffffff" stroke-opacity=".26" stroke-width="2"/>
      <text x="76" y="298" fill="#fff0dc" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="800" letter-spacing="3">YOUR OFFICIAL EVENT PASS</text>
      <rect x="76" y="330" width="108" height="108" rx="28" fill="#ffffff" fill-opacity=".19" stroke="#ffffff" stroke-opacity=".45" stroke-width="2"/>
      <text x="130" y="400" fill="#ffffff" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="700">✦</text>
      <rect x="204" y="343" width="245" height="38" rx="19" fill="#ffffff" fill-opacity=".16"/>
      <text x="326" y="368" fill="#ffffff" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" letter-spacing="1.8">${xmlEscape(category.toUpperCase())}</text>
      ${textBlock(title, 204, 416, { size: 45, weight: 800, maxChars: 27, maxLines: 2, lineHeight: 1.15 })}
      ${descLines.map((line, index) => `<text x="78" y="493" dy="${index * 32}" fill="#ffffff" fill-opacity=".86" font-family="Arial, Helvetica, sans-serif" font-size="22">${xmlEscape(line)}</text>`).join("")}
      <path d="M76 604 H924" stroke="#ffffff" stroke-opacity=".24" stroke-width="2"/>
      <text x="76" y="656" fill="#fff4ef" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="800" letter-spacing="3">PASS DETAILS</text>
      ${detailCard({ x: 76, y: 684, w: 408, h: 132, label: "DATE & TIME", value: `${date} · ${time}`, lines: 2 })}
      ${detailCard({ x: 516, y: 684, w: 408, h: 132, label: "VENUE", value: venue, lines: 2 })}
      ${detailCard({ x: 76, y: 840, w: 408, h: 132, label: "REGISTERED STUDENT", value: student, lines: 2 })}
      ${detailCard({ x: 516, y: 840, w: 408, h: 132, label: "ROLL NUMBER / PIN", value: roll, lines: 2 })}
      ${detailCard({ x: 76, y: 996, w: 848, h: 132, label: "PASS ID", value: passId, lines: 1 })}
      <rect x="76" y="1172" width="848" height="114" rx="24" fill="#ffffff" fill-opacity=".12" stroke="#ffffff" stroke-opacity=".22"/>
      <text x="104" y="1218" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700">Keep this pass ready for event check-in</text>
      <text x="104" y="1254" fill="#ffffff" fill-opacity=".8" font-family="Arial, Helvetica, sans-serif" font-size="17">SMT. B. SEETHA POLYTECHNIC · FEST CLUB</text>
      <text x="904" y="1250" fill="#ffffff" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="34">✦</text>
    </g>
    <rect x="31" y="31" width="938" height="1352" rx="37" fill="none" stroke="#ffffff" stroke-opacity=".58" stroke-width="2"/>
  </svg>`;
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function joinBytes(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function stringBytes(value) { return new TextEncoder().encode(value); }

function buildPdfFromJpeg(jpegBytes, width, height) {
  const objects = [];
  objects[1] = stringBytes("<< /Type /Catalog /Pages 2 0 R >>");
  objects[2] = stringBytes("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objects[3] = stringBytes("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /PassImage 5 0 R >> >> /Contents 4 0 R >>");
  const content = "q\n595.28 0 0 841.89 0 0 cm\n/PassImage Do\nQ\n";
  objects[4] = stringBytes(`<< /Length ${stringBytes(content).length} >>\nstream\n${content}endstream`);
  const imageHead = stringBytes(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
  const imageTail = stringBytes("\nendstream");
  objects[5] = joinBytes([imageHead, jpegBytes, imageTail]);

  const chunks = [stringBytes("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
  const offsets = [0];
  let currentOffset = chunks[0].length;
  for (let i = 1; i <= 5; i += 1) {
    offsets[i] = currentOffset;
    const chunk = joinBytes([stringBytes(`${i} 0 obj\n`), objects[i], stringBytes("\nendobj\n")]);
    chunks.push(chunk);
    currentOffset += chunk.length;
  }
  const xrefOffset = currentOffset;
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i += 1) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(stringBytes(xref + trailer));
  return new Blob([joinBytes(chunks)], { type: "application/pdf" });
}

export async function downloadPassPdf(event, registration) {
  const originalLabel = document.activeElement?.textContent || "";
  try {
    const svg = await makePassSvg(event, registration);
    const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    try {
      const image = new Image();
      image.decoding = "async";
      image.src = svgUrl;
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("Could not render the event pass for download."));
      });
      const canvas = document.createElement("canvas");
      canvas.width = PAGE_W * 2;
      canvas.height = PAGE_H * 2;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Your browser could not prepare the pass PDF.");
      context.fillStyle = "#f7f3fb";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.96);
      const jpegBytes = base64ToBytes(dataUrl.split(",")[1]);
      const pdfBlob = buildPdfFromJpeg(jpegBytes, canvas.width, canvas.height);
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const anchor = document.createElement("a");
      const safeTitle = String(event?.title || registration?.eventTitle || "event-pass")
        .normalize("NFKD").replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "event-pass";
      anchor.href = pdfUrl;
      anchor.download = `${safeTitle}-fest-club-pass.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 30000);
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  } catch (error) {
    console.error("Event pass PDF download failed:", error);
    window.alert("Pass download failed. Please try again. If it continues, check that college-logo.png exists in your public folder.");
  }
}
