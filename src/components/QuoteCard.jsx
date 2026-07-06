import React, { useRef } from "react";
import { Download, Quote, Share2 } from "lucide-react";

export default function QuoteCard({ quoteText, title, channel }) {
  const canvasRef = useRef(null);

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    let lines = [];

    for (let n = 0; n < words.length; n++) {
      let testLine = line + words[n] + " ";
      let metrics = ctx.measureText(testLine);
      let testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        lines.push(line);
        line = words[n] + " ";
      } else {
        line = testLine;
      }
    }
    lines.push(line);

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, y + i * lineHeight);
    }
    return lines.length;
  }

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    
    // Set Dimensions (Square, perfect for social media sharing!)
    canvas.width = 1080;
    canvas.height = 1080;

    // 1. Draw elegant dark-indigo radial gradient
    const gradient = ctx.createRadialGradient(540, 540, 100, 540, 540, 800);
    gradient.addColorStop(0, "#1e1b4b"); // Indigo-950
    gradient.addColorStop(0.5, "#0f172a"); // Slate-900
    gradient.addColorStop(1, "#020617"); // Slate-950
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Draw subtle grid background lines
    ctx.strokeStyle = "rgba(79, 70, 229, 0.04)";
    ctx.lineWidth = 2;
    for (let i = 0; i < canvas.width; i += 60) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(canvas.width, i);
      ctx.stroke();
    }

    // 3. Draw glow ring
    ctx.strokeStyle = "rgba(99, 102, 241, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(540, 540, 480, 0, Math.PI * 2);
    ctx.stroke();

    // 4. Draw large quotation icon
    ctx.fillStyle = "rgba(99, 102, 241, 0.15)";
    ctx.font = "800 240px sans-serif";
    ctx.fillText("“", 80, 240);

    // 5. Draw the Main Quote Text
    ctx.fillStyle = "#f8fafc"; // Slate-50
    ctx.font = "italic 600 48px 'Plus Jakarta Sans', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    
    const margin = 120;
    const maxWidth = canvas.width - (margin * 2);
    const startY = 320;
    const lineHeight = 68;
    
    // Draw wrapped text and get line count
    const lineCount = wrapText(ctx, `"${quoteText}"`, margin, startY, maxWidth, lineHeight);

    // 6. Draw Podcast info at the bottom
    const bottomY = Math.max(startY + lineCount * lineHeight + 80, 780);
    
    // Divider line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(margin, bottomY);
    ctx.lineTo(canvas.width - margin, bottomY);
    ctx.stroke();

    // Episode & Channel metadata
    ctx.fillStyle = "#e2e8f0"; // Slate-200
    ctx.font = "bold 32px 'Outfit', sans-serif";
    ctx.fillText(title.length > 45 ? title.substring(0, 45) + "..." : title, margin, bottomY + 40);

    ctx.fillStyle = "#818cf8"; // Indigo-400
    ctx.font = "600 26px sans-serif";
    ctx.fillText(channel || "Spotify Podcast", margin, bottomY + 95);

    // PodMind Branding Badge
    ctx.fillStyle = "rgba(99, 102, 241, 0.1)";
    ctx.beginPath();
    const badgeX = canvas.width - margin - 220;
    const badgeY = bottomY + 40;
    const badgeW = 220;
    const badgeH = 50;
    const radius = 10;
    
    ctx.roundRect ? ctx.roundRect(badgeX, badgeY, badgeW, badgeH, radius) : ctx.rect(badgeX, badgeY, badgeW, badgeH);
    ctx.fill();

    ctx.fillStyle = "#a5b4fc"; // Indigo-300
    ctx.font = "bold 20px 'Outfit', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("PODMIND AI", badgeX + (badgeW / 2), badgeY + 15);

    // 7. Save canvas as PNG
    const link = document.createElement("a");
    link.download = `${title.replace(/\s+/g, "_").substring(0, 20)}_quote_card.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col justify-between max-w-lg mx-auto relative overflow-hidden group">
      {/* Absolute background element */}
      <div className="absolute -top-20 -right-20 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-indigo-500/20 transition-all duration-500"></div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <Quote className="w-5 h-5 text-indigo-400" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Transcript Snippet Card</span>
        </div>

        {/* Card Preview Area */}
        <div className="bg-gradient-to-br from-indigo-950/60 to-slate-900/80 border border-slate-800/80 rounded-xl p-8 min-h-[220px] flex flex-col justify-between shadow-inner relative">
          <p className="text-lg italic font-medium text-slate-100 leading-relaxed mb-6 font-sans">
            "{quoteText}"
          </p>
          <div className="border-t border-slate-800/60 pt-4 mt-auto">
            <h4 className="text-sm font-bold text-white font-display line-clamp-1">{title}</h4>
            <p className="text-xs text-indigo-400 font-semibold mt-0.5">{channel}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleDownload}
          className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors cursor-pointer shadow-lg shadow-indigo-600/15"
        >
          <Download className="w-4 h-4" />
          Download Quote Card (PNG)
        </button>

        {/* Hidden Canvas for High-Res Render */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
