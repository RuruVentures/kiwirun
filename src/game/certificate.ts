import type { RaceMode } from "./course";

/**
 * Render a shareable "certificate of achievement" for a race result onto a
 * canvas — very NZ-primary-school. Everyone gets one.
 */
export type CertInfo = {
  name: string;
  award: string;
  place: number;
  mode: RaceMode;
};

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export function makeCertificate(info: CertInfo): HTMLCanvasElement {
  const W = 1000;
  const H = 700;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const cx = W / 2;

  // parchment + double border
  ctx.fillStyle = "#f6edcf";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#c9a227";
  ctx.lineWidth = 12;
  ctx.strokeRect(26, 26, W - 52, H - 52);
  ctx.strokeStyle = "#1e5c24";
  ctx.lineWidth = 3;
  ctx.strokeRect(44, 44, W - 88, H - 88);

  ctx.textAlign = "center";
  const font = (w: string, px: number) =>
    (ctx.font = `${w} ${px}px system-ui, -apple-system, Segoe UI, sans-serif`);

  ctx.fillStyle = "#1e5c24";
  font("bold", 30);
  ctx.fillText("🥝  KIWI RUN · CROSS COUNTRY", cx, 112);

  ctx.fillStyle = "#8a6a2f";
  font("600", 19);
  ctx.fillText("· CERTIFICATE OF ACHIEVEMENT ·", cx, 150);

  ctx.fillStyle = "#b8860b";
  font("bold", 46);
  ctx.fillText(info.award, cx, 258);

  ctx.fillStyle = "#5a5033";
  font("italic", 22);
  ctx.fillText("proudly awarded to", cx, 330);

  ctx.fillStyle = "#182610";
  font("bold", 62);
  ctx.fillText(info.name, cx, 402);

  const modeLabel =
    info.mode === "last" ? "Last Kiwi Running" : "Finish Line";
  ctx.fillStyle = "#3a4a2a";
  font("500", 24);
  ctx.fillText(`${ordinal(info.place)} place · ${modeLabel}`, cx, 462);

  // a little row of kiwis
  font("400", 40);
  ctx.fillText("🥝   🥝   🥝", cx, 545);

  ctx.fillStyle = "#8a6a2f";
  font("400", 18);
  const date = new Date().toLocaleDateString();
  ctx.fillText(`${date}   ·   kiwirun.nz`, cx, 632);

  return c;
}

/** Share the certificate image (mobile share sheet) or download it. */
export async function shareCertificate(
  canvas: HTMLCanvasElement,
  name: string
): Promise<void> {
  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/png")
  );
  if (!blob) return;
  const file = new File([blob], "kiwi-run-certificate.png", {
    type: "image/png",
  });
  const nav = navigator as Navigator & {
    canShare?: (d: unknown) => boolean;
  };
  if (nav.canShare?.({ files: [file] }) && typeof nav.share === "function") {
    try {
      await nav.share({
        files: [file],
        title: "Kiwi Run",
        text: `${name}'s Kiwi Run certificate 🥝`,
      });
      return;
    } catch {
      // fell through to download
    }
  }
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = "kiwi-run-certificate.png";
  a.click();
}
