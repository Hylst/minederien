import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  playReveal, playFlag, playUnflag, playExplosion,
  playClick, playFlood, playWaveComplete, playPowerUpPickup, playPowerUpActivate,
  playCombo, playShieldAbsorb, playRadarPing, playFreezeSfx, playHintSfx,
  playDefuseSfx, playScannerSfx, playBonusFound, playStar, playGameOver,
  startAmbientMusic, toggleMusic, setMasterVolume,
} from "./audio";

/* ════════════════════════════════════════════════════════════════
   TYPES
   ════════════════════════════════════════════════════════════════ */

type PowerUpType = "shield" | "scanner" | "defuser" | "radar" | "freeze" | "hint";
type ActiveMode = null | "scanner" | "defuser" | "radar" | "hint";
type Phase = "onboarding" | "idle" | "playing" | "waveComplete" | "gameOver";
type BonusType = "star" | "gem" | "combo";

type WaveCfg = { rows: number; cols: number; mines: number };

type Cell = {
  isMine: boolean; isRevealed: boolean; isFlagged: boolean;
  neighborMines: number; delay: number; bonus: BonusType | null; bonusCollected: boolean;
};

type Board = Cell[][];

type PowerUpDef = {
  type: PowerUpType; name: string; emoji: string;
  desc: string; passive: boolean; color: string; bgColor: string;
};

const PU_DEFS: PowerUpDef[] = [
  { type: "shield",  name: "Bouclier",    emoji: "🛡️", desc: "Absorbe un impact de mine",              passive: true,  color: "text-blue-400",   bgColor: "from-blue-500/20 to-blue-600/30 border-blue-500/30" },
  { type: "scanner", name: "Scanner",     emoji: "🔍", desc: "Révèle toute une ligne et une colonne",   passive: false, color: "text-cyan-400",   bgColor: "from-cyan-500/20 to-cyan-600/30 border-cyan-500/30" },
  { type: "defuser", name: "Démineur",    emoji: "🔧", desc: "Désamorce une mine au clic",              passive: false, color: "text-amber-400",  bgColor: "from-amber-500/20 to-amber-600/30 border-amber-500/30" },
  { type: "radar",   name: "Radar",       emoji: "📡", desc: "Révèle la densité de mines sur 5×5",     passive: false, color: "text-teal-400",   bgColor: "from-teal-500/20 to-teal-600/30 border-teal-500/30" },
  { type: "freeze",  name: "Gel Tempo",   emoji: "⏱️", desc: "Gèle le chronomètre pendant 30s",        passive: true,  color: "text-indigo-400", bgColor: "from-indigo-500/20 to-indigo-600/30 border-indigo-500/30" },
  { type: "hint",    name: "Indice",      emoji: "💡", desc: "Illumine 3 cellules sûres",              passive: false, color: "text-yellow-400", bgColor: "from-yellow-500/20 to-yellow-600/30 border-yellow-500/30" },
];

const NUM_CLR: Record<number, string> = {
  1: "text-sky-400", 2: "text-emerald-400", 3: "text-red-400", 4: "text-indigo-400",
  5: "text-amber-500", 6: "text-teal-400", 7: "text-zinc-300", 8: "text-zinc-500",
};

/* ════════════════════════════════════════════════════════════════
   WAVE CONFIG
   ════════════════════════════════════════════════════════════════ */

function waveCfg(w: number): WaveCfg {
  const rows = Math.min(6 + Math.floor((w - 1) * 0.7), 20);
  const cols = Math.min(6 + Math.floor((w - 1) * 1.0), 32);
  const density = Math.min(0.07 + (w - 1) * 0.007, 0.22);
  const mines = Math.max(2, Math.floor(rows * cols * density));
  return { rows, cols, mines };
}

function starRating(time: number, wave: number): number {
  const par = 15 + wave * 8; // seconds
  if (time <= par * 0.5) return 3;
  if (time <= par) return 2;
  return 1;
}

/* ════════════════════════════════════════════════════════════════
   BOARD LOGIC
   ════════════════════════════════════════════════════════════════ */

function emptyBoard(r: number, c: number): Board {
  return Array.from({ length: r }, () =>
    Array.from({ length: c }, () => ({
      isMine: false, isRevealed: false, isFlagged: false,
      neighborMines: 0, delay: 0, bonus: null, bonusCollected: false,
    }))
  );
}

function placeMines(b: Board, r: number, c: number, m: number, sr: number, sc: number): Board {
  const nb = b.map(row => row.map(cl => ({ ...cl })));
  const safe = new Set<number>();
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const nr = sr + dr, nc = sc + dc;
    if (nr >= 0 && nr < r && nc >= 0 && nc < c) safe.add(nr * c + nc);
  }
  const pos = Array.from({ length: r * c }, (_, i) => i).filter(p => !safe.has(p));
  for (let i = pos.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pos[i], pos[j]] = [pos[j], pos[i]]; }
  const cnt = Math.min(m, pos.length);
  for (let i = 0; i < cnt; i++) { const p = pos[i]; nb[Math.floor(p / c)][p % c].isMine = true; }
  // neighbor counts
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) {
    if (nb[i][j].isMine) continue;
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const ni = i + dr, nj = j + dc;
      if (ni >= 0 && ni < r && nj >= 0 && nj < c && nb[ni][nj].isMine) n++;
    }
    nb[i][j].neighborMines = n;
  }
  // sprinkle bonus items (~4% of safe cells)
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) {
    if (!nb[i][j].isMine && Math.random() < 0.04) {
      const rng = Math.random();
      nb[i][j].bonus = rng < 0.5 ? "star" : rng < 0.8 ? "gem" : "combo";
    }
  }
  return nb;
}

function flood(b: Board, R: number, C: number, r: number, c: number): Board {
  const nb = b.map(row => row.map(cl => ({ ...cl })));
  const stk: [number, number, number][] = [[r, c, 0]];
  while (stk.length) {
    const [cr, cc, d] = stk.pop()!;
    const cl = nb[cr][cc];
    if (cl.isRevealed || cl.isFlagged) continue;
    cl.isRevealed = true; cl.delay = d * 22;
    if (cl.neighborMines === 0 && !cl.isMine) {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = cr + dr, nc = cc + dc;
        if (nr >= 0 && nr < R && nc >= 0 && nc < C && !nb[nr][nc].isRevealed && !nb[nr][nc].isFlagged && !nb[nr][nc].isMine)
          stk.push([nr, nc, d + 1]);
      }
    }
  }
  return nb;
}

function revealAll(b: Board): Board {
  return b.map(row => row.map(c => ({ ...c, isRevealed: true, isFlagged: false })));
}

function checkWin(b: Board, mines: number): boolean {
  let safe = 0;
  for (const row of b) for (const cl of row) {
    if (!cl.isMine && !cl.isRevealed) return false;
    if (!cl.isRevealed) safe++;
  }
  return safe === mines;
}

/* ════════════════════════════════════════════════════════════════
   SMALL COMPONENTS
   ════════════════════════════════════════════════════════════════ */

function Pad3(n: number): string {
  const s = n < 0 ? "-" : "";
  return s + Math.min(Math.abs(n), 999).toString().padStart(3 - s.length, "0");
}

function CellBtn({ cl, r, c, sz, onL, onR, hintCells, radarCells, active }: {
  cl: Cell; r: number; c: number; sz: number;
  onL: (r: number, c: number) => void; onR: (r: number, c: number, e: React.MouseEvent) => void;
  hintCells: Set<string>; radarCells: Map<string, boolean>; active: ActiveMode;
}) {
  const key = `${r},${c}`;
  let content: React.ReactNode = null;
  let bg = "bg-zinc-600 hover:bg-zinc-500 active:bg-zinc-700 cursor-pointer";
  let txt = ""; let extra = ""; let shadow = "";

  if (cl.isRevealed) {
    if (cl.isMine) {
      content = "💣"; bg = "bg-red-500/80"; extra = "anim-mine-explode";
    } else if (cl.neighborMines > 0) {
      content = cl.neighborMines; txt = NUM_CLR[cl.neighborMines] || "text-zinc-300";
      bg = "bg-zinc-800/50"; extra = "anim-cell-reveal";
    } else {
      bg = "bg-zinc-800/35"; extra = "anim-cell-reveal";
    }
    // Bonus overlay
    if (cl.bonus && !cl.bonusCollected && !cl.isMine) {
      const bonusEmoji = cl.bonus === "star" ? "⭐" : cl.bonus === "gem" ? "💎" : "⚡";
      content = <span className="relative"><span className="opacity-40">{cl.neighborMines || ""}</span><span className="absolute inset-0 flex items-center justify-center text-[0.55em]">{bonusEmoji}</span></span>;
      extra = "anim-cell-reveal anim-sparkle";
    }
  } else if (cl.isFlagged) {
    content = "🚩"; bg = "bg-zinc-600 hover:bg-zinc-500"; extra = "anim-cell-flag";
  } else {
    shadow = "shadow-[inset_1px_1px_0_rgba(255,255,255,.1),inset_-1px_-1px_0_rgba(0,0,0,.25)]";
    if (hintCells.has(key)) { extra = "anim-hint"; bg = "bg-yellow-600/40 hover:bg-yellow-500/40"; }
    if (radarCells.has(key)) {
      extra = "anim-radar-cell";
      bg = radarCells.get(key) ? "bg-red-500/40" : "bg-emerald-500/30";
    }
  }

  return (
    <button type="button"
      onContextMenu={e => onR(r, c, e)}
      onClick={() => onL(r, c)}
      className={`flex select-none items-center justify-center border border-zinc-500/30 font-bold transition-all ${bg} ${txt} ${extra} ${shadow} ${active ? "cursor-crosshair" : ""}`}
      style={{
        width: sz, height: sz, fontSize: Math.max(10, Math.floor(sz * .52)),
        animationDelay: cl.isRevealed ? `${cl.delay}ms` : "0ms",
        borderRadius: 3,
        boxShadow: !cl.isRevealed ? "inset 1px 1px 0 rgba(255,255,255,.1),inset -1px -1px 0 rgba(0,0,0,.25)" : "inset 0 0 4px rgba(0,0,0,.12)",
        textShadow: cl.isRevealed && !cl.isMine && cl.neighborMines > 0 ? "0 1px 2px rgba(0,0,0,.5)" : "none",
      }}
    >{content}</button>
  );
}

/* ════════════════════════════════════════════════════════════════
   ONBOARDING MODAL
   ════════════════════════════════════════════════════════════════ */

const ONBOARD_STEPS = [
  { icon: "💣", title: "Bienvenue dans Mine de Rien !", text: "Chaque vague cache des mines dans une grille. Révélez toutes les cellules sûres pour progresser !" },
  { icon: "👆", title: "Révéler les cellules", text: "Clic gauche pour révéler une cellule. Si elle est sûre, un nombre indique les mines adjacentes." },
  { icon: "🚩", title: "Marquer les mines", text: "Clic droit pour planter un drapeau sur une mine suspecte. Cliquez à nouveau pour retirer." },
  { icon: "💡", title: "Lire les indices", text: "Le chiffre « 3 » signifie 3 mines autour. Utilisez cette logique pour déduire les cases sûres !" },
  { icon: "🎁", title: "Bonus & Récompenses", text: "Certaines cellules cachent des bonus (⭐💎⚡). À chaque vague terminée, choisissez un pouvoir !" },
  { icon: "🚀", title: "Prêt à jouer !", text: "La difficulté augmente progressivement. Bonne chance, démineur !" },
];

function OnboardingModal({ step, onNext, onPrev, onClose }: {
  step: number; onNext: () => void; onPrev: () => void; onClose: () => void;
}) {
  const s = ONBOARD_STEPS[step];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass anim-bounce-in w-full max-w-md rounded-2xl p-6 text-center shadow-2xl">
        <div className="mb-4 text-5xl">{s.icon}</div>
        <h2 className="mb-2 text-xl font-bold text-white">{s.title}</h2>
        <p className="mb-6 text-sm text-zinc-300 leading-relaxed">{s.text}</p>
        <div className="mb-4 flex justify-center gap-1.5">
          {ONBOARD_STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 w-8 rounded-full transition-colors ${i === step ? "bg-blue-500" : i < step ? "bg-blue-500/40" : "bg-zinc-700"}`} />
          ))}
        </div>
        <div className="flex justify-between gap-3">
          {step > 0 ? (
            <button onClick={onPrev} className="rounded-lg bg-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-600 transition">← Précédent</button>
          ) : <div />}
          {step < ONBOARD_STEPS.length - 1 ? (
            <button onClick={onNext} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition">Suivant →</button>
          ) : (
            <button onClick={onClose} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition">Commencer ! 🎮</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   RULES MODAL
   ════════════════════════════════════════════════════════════════ */

function RulesModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"regles" | "bonus" | "controles">("regles");
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass anim-bounce-in w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex border-b border-white/10">
          {(["regles", "bonus", "controles"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition ${tab === t ? "tab-active" : "tab-inactive"}`}>
              {t === "regles" ? "📜 Règles" : t === "bonus" ? "🎁 Bonus" : "🎮 Contrôles"}
            </button>
          ))}
        </div>
        <div className="p-5 max-h-[60vh] overflow-y-auto text-sm text-zinc-300 space-y-3">
          {tab === "regles" && <>
            <p><strong className="text-white">Objectif :</strong> Révélez toutes les cellules sûres sans cliquer sur une mine.</p>
            <p><strong className="text-white">Vagues :</strong> Chaque vague augmente la taille de la grille et le nombre de mines. Survivez à toutes !</p>
            <p><strong className="text-white">Nombres :</strong> Un chiffre indique le nombre de mines dans les 8 cases adjacentes.</p>
            <p><strong className="text-white">Combo :</strong> Révélez rapidement des cellules pour enchaîner un combo multiplicateur de points.</p>
            <p><strong className="text-white">Étoiles :</strong> Terminez rapidement pour obtenir 1 à 3 étoiles par vague.</p>
          </>}
          {tab === "bonus" && <>
            {PU_DEFS.map(p => (
              <div key={p.type} className="flex items-start gap-3 rounded-lg bg-white/5 p-3">
                <span className="text-2xl">{p.emoji}</span>
                <div><strong className={`text-white`}>{p.name}</strong> — {p.desc}<br/>
                <span className="text-xs text-zinc-500">{p.passive ? "Passif (s'active automatiquement)" : "Actif (cliquez pour cibler)"}</span></div>
              </div>
            ))}
            <p className="mt-2 text-xs text-zinc-500">⭐ Points bonus · 💎 Gros bonus · ⚡ Combo boost</p>
          </>}
          {tab === "controles" && <>
            <p><strong className="text-white">Clic gauche :</strong> Révéler une cellule</p>
            <p><strong className="text-white">Clic droit :</strong> Poser / retirer un drapeau</p>
            <p><strong className="text-white">Clic sur numéro :</strong> Si le bon nombre de drapeaux est placé autour, révèle les voisins non marqués</p>
            <p><strong className="text-white">Mobile :</strong> Basculez entre mode Révélation et Drapeau avec le bouton en bas</p>
            <p><strong className="text-white">Raccourcis :</strong> R = Recommencer · Échap = Annuler bonus actif</p>
          </>}
        </div>
        <div className="border-t border-white/10 p-4 text-center">
          <button onClick={onClose} className="rounded-lg bg-zinc-700 px-6 py-2 text-sm text-zinc-300 hover:bg-zinc-600 transition">Fermer</button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   WAVE COMPLETE MODAL
   ════════════════════════════════════════════════════════════════ */

function WaveCompleteModal({ wave, time, score, comboMax, choices, onPick, onNext }: {
  wave: number; time: number; score: number; comboMax: number;
  choices: PowerUpType[]; onPick: (t: PowerUpType) => void; onNext: () => void;
}) {
  const stars = starRating(time, wave);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass anim-bounce-in w-full max-w-md rounded-2xl p-6 text-center shadow-2xl">
        <h2 className="mb-1 text-2xl font-black text-white">🎉 Vague {wave} terminée !</h2>
        <div className="mb-4 flex justify-center gap-2">
          {[1, 2, 3].map(n => (
            <span key={n} className={`text-3xl anim-star ${n <= stars ? "opacity-100" : "opacity-20"}`}
              style={{ animationDelay: `${n * 0.2}s` }}>⭐</span>
          ))}
        </div>
        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-white/5 p-2"><p className="text-lg font-bold text-blue-400">{score}</p><p className="text-[10px] text-zinc-500">Score</p></div>
          <div className="rounded-lg bg-white/5 p-2"><p className="text-lg font-bold text-amber-400">{time}s</p><p className="text-[10px] text-zinc-500">Temps</p></div>
          <div className="rounded-lg bg-white/5 p-2"><p className="text-lg font-bold text-pink-400">×{comboMax}</p><p className="text-[10px] text-zinc-500">Combo max</p></div>
        </div>
        <p className="mb-3 text-sm font-semibold text-zinc-300">🎁 Choisissez votre récompense :</p>
        <div className="mb-5 flex justify-center gap-3">
          {choices.map((t, i) => {
            const d = PU_DEFS.find(p => p.type === t)!;
            return (
              <button key={i} onClick={() => onPick(d.type)}
                className={`pu-card flex flex-col items-center gap-1 rounded-xl border bg-gradient-to-b ${d.bgColor} px-4 py-3 text-center transition hover:scale-105`}>
                <span className="text-2xl">{d.emoji}</span>
                <span className="text-xs font-semibold text-white">{d.name}</span>
                <span className="text-[10px] text-zinc-400 leading-tight max-w-[80px]">{d.desc}</span>
              </button>
            );
          })}
        </div>
        <button onClick={onNext}
          className="rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-2.5 font-semibold text-white shadow-lg hover:from-blue-500 hover:to-purple-500 transition">
          Vague Suivante →
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   GAME OVER MODAL
   ════════════════════════════════════════════════════════════════ */

function GameOverModal({ wave, score, onRestart }: {
  wave: number; score: number; onRestart: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass anim-bounce-in w-full max-w-sm rounded-2xl p-6 text-center shadow-2xl">
        <div className="mb-3 text-5xl">💥</div>
        <h2 className="mb-1 text-2xl font-black text-red-400">BOOM !</h2>
        <p className="mb-4 text-sm text-zinc-400">Vous avez atteint la vague {wave}</p>
        <div className="mb-5 rounded-xl bg-white/5 p-4">
          <p className="text-3xl font-black text-white">{score}</p>
          <p className="text-xs text-zinc-500">Score final</p>
        </div>
        <button onClick={onRestart}
          className="w-full rounded-xl bg-gradient-to-r from-red-600 to-orange-600 px-6 py-2.5 font-semibold text-white shadow-lg hover:from-red-500 hover:to-orange-500 transition">
          Recommencer 🔄
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   MAIN APP
   ════════════════════════════════════════════════════════════════ */

export default function App() {
  // ─── State ──────────────────────────────────────────────
  const [wave, setWave] = useState(1);
  const cfg = useMemo(() => waveCfg(wave), [wave]);

  const [board, setBoard] = useState<Board>(() => emptyBoard(cfg.rows, cfg.cols));
  const [phase, setPhase] = useState<Phase>("onboarding");
  const [flagCnt, setFlagCnt] = useState(0);
  const [time, setTime] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [comboMax, setComboMax] = useState(0);
  const [cellSz, setCellSz] = useState(36);
  const [shake, setShake] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [volume, setVolume] = useState(50);
  const [showSettings, setShowSettings] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [onboardStep, setOnboardStep] = useState(0);
  const [frozen, setFrozen] = useState(false);
  const [shieldActive, setShieldActive] = useState(false);
  const [hintCells, setHintCells] = useState<Set<string>>(new Set());
  const [radarCells, setRadarCells] = useState<Map<string, boolean>>(new Map());
  const [activeMode, setActiveMode] = useState<ActiveMode>(null);
  const [inventory, setInventory] = useState<PowerUpType[]>([]);
  const [waveChoices, setWaveChoices] = useState<PowerUpType[]>([]);
  const [pickedChoice, setPickedChoice] = useState(false);
  const [mobileMode, setMobileMode] = useState<"reveal" | "flag">("reveal");
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; color: string; dx: number; dy: number }[]>([]);
  const [bonusFloats, setBonusFloats] = useState<{ id: number; x: number; y: number; text: string }[]>([]);
  const [comboPop, setComboPop] = useState(false);
  const [totalStars, setTotalStars] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    try { return Number(localStorage.getItem("minederien_hs") || 0); } catch { return 0; }
  });

  const timerRef = useRef<number | null>(null);
  const frozenRef = useRef(false);
  const firstClick = useRef(true);
  const comboTimer = useRef<number | null>(null);
  const freezeTimer = useRef<number | null>(null);
  const hintTimer = useRef<number | null>(null);
  const radarTimer = useRef<number | null>(null);
  const idRef = useRef(0);
  const isTouch = useRef(false);

  // ─── Detect touch ───────────────────────────────────────
  useEffect(() => {
    const h = () => { isTouch.current = true; };
    window.addEventListener("touchstart", h, { once: true });
    return () => window.removeEventListener("touchstart", h);
  }, []);

  // ─── Responsive cell size ───────────────────────────────
  useEffect(() => {
    const compute = () => {
      const maxW = Math.min(window.innerWidth - 40, 1400);
      const maxH = window.innerHeight - 340;
      const sW = Math.floor(maxW / cfg.cols);
      const sH = Math.floor(maxH / cfg.rows);
      setCellSz(Math.max(18, Math.min(44, sW, sH)));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [cfg.cols, cfg.rows]);

  // ─── Cleanup ────────────────────────────────────────────
  useEffect(() => () => {
    [timerRef, comboTimer, freezeTimer, hintTimer, radarTimer].forEach(r => { if (r.current) window.clearInterval(r.current); });
  }, []);

  // ─── Keyboard shortcuts ─────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setActiveMode(null); setHintCells(new Set()); setRadarCells(new Map()); }
      if (e.key === "r" || e.key === "R") restartGame();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  // ─── High score persistence ─────────────────────────────
  useEffect(() => {
    if (score > highScore) { setHighScore(score); try { localStorage.setItem("minederien_hs", String(score)); } catch {} }
  }, [score, highScore]);

  // ─── Timer ──────────────────────────────────────────────
  // frozenRef (pas juste l'etat "frozen") : le callback du setInterval capture
  // sa valeur au moment de la creation, sinon activer le gel apres coup ne
  // change rien au chrono deja lance.
  useEffect(() => { frozenRef.current = frozen; }, [frozen]);

  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = window.setInterval(() => {
      if (!frozenRef.current) setTime(t => Math.min(t + 1, 9999));
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  // ─── Freeze handling ────────────────────────────────────
  useEffect(() => {
    if (frozen) {
      freezeTimer.current = window.setTimeout(() => setFrozen(false), 30000);
      return () => { if (freezeTimer.current) clearTimeout(freezeTimer.current); };
    }
  }, [frozen]);

  // ─── Reset wave ─────────────────────────────────────────
  const restartGame = useCallback(() => {
    setWave(1); setScore(0); setCombo(0); setComboMax(0); setTotalStars(0);
    setInventory([]); setShieldActive(false); setActiveMode(null);
    setHintCells(new Set()); setRadarCells(new Map());
    const c = waveCfg(1);
    setBoard(emptyBoard(c.rows, c.cols));
    setPhase("idle"); setFlagCnt(0); setTime(0); setFrozen(false);
    stopTimer(); firstClick.current = true;
    [comboTimer, freezeTimer, hintTimer, radarTimer].forEach(r => { if (r.current) { clearTimeout(r.current); r.current = null; } });
  }, [stopTimer]);

  const startNextWave = useCallback(() => {
    const nw = wave + 1;
    setWave(nw);
    const c = waveCfg(nw);
    setBoard(emptyBoard(c.rows, c.cols));
    setPhase("idle"); setFlagCnt(0); setTime(0); setFrozen(false);
    setCombo(0); setActiveMode(null); setPickedChoice(false);
    setHintCells(new Set()); setRadarCells(new Map());
    stopTimer(); firstClick.current = true;
  }, [wave, stopTimer]);

  // ─── Reset on wave change ───────────────────────────────
  useEffect(() => {
    if (wave > 1) {
      const c = waveCfg(wave);
      setBoard(emptyBoard(c.rows, c.cols));
      setPhase("idle"); setFlagCnt(0); setTime(0); setFrozen(false);
      setCombo(0); setActiveMode(null); setPickedChoice(false);
      setHintCells(new Set()); setRadarCells(new Map());
      stopTimer(); firstClick.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wave]);

  // ─── Scoring helpers ────────────────────────────────────
  const addScore = useCallback((pts: number) => {
    setScore(s => s + pts);
  }, []);

  const bumpCombo = useCallback(() => {
    setCombo(c => {
      const nc = c + 1;
      setComboMax(m => Math.max(m, nc));
      setComboPop(true);
      setTimeout(() => setComboPop(false), 300);
      playCombo(nc);
      addScore(nc * 5);
      return nc;
    });
    if (comboTimer.current) clearTimeout(comboTimer.current);
    comboTimer.current = window.setTimeout(() => setCombo(0), 2500);
  }, [addScore]);

  const showBonus = useCallback((x: number, y: number, text: string) => {
    const id = idRef.current++;
    setBonusFloats(f => [...f, { id, x, y, text }]);
    setTimeout(() => setBonusFloats(f => f.filter(b => b.id !== id)), 1200);
  }, []);

  const spawnParticles = useCallback((count: number) => {
    const colors = ["#22c55e", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"];
    const ps = Array.from({ length: count }, () => ({
      id: idRef.current++, x: 50 + (Math.random() - .5) * 70, y: 30 + Math.random() * 40,
      color: colors[Math.floor(Math.random() * colors.length)],
      dx: (Math.random() - .5) * 120, dy: -20 - Math.random() * 80,
    }));
    setParticles(ps); setTimeout(() => setParticles([]), 2000);
  }, []);

  // ─── Collect bonus ──────────────────────────────────────
  // Compare l'ancien plateau au nouveau et ramasse le bonus de TOUTE cellule
  // qui vient de passer a revelee (pas seulement celle cliquee) : sinon un
  // bonus englouti par un flood-fill ou par le Scanner reste affiche mais
  // impossible a ramasser pour toujours, la cellule etant deja revelee.
  const collectBonuses = useCallback((oldBoard: Board, newBoard: Board): Board => {
    let nb = newBoard;
    let copied = false;
    for (let r = 0; r < nb.length; r++) {
      for (let c = 0; c < nb[r].length; c++) {
        const was = oldBoard[r][c];
        const cl = nb[r][c];
        if (cl.isRevealed && !was.isRevealed && cl.bonus && !cl.bonusCollected && !cl.isMine) {
          if (!copied) { nb = nb.map(row => row.map(cell => ({ ...cell }))); copied = true; }
          nb[r][c] = { ...nb[r][c], bonusCollected: true };
          if (cl.bonus === "star") { addScore(50); playBonusFound(); showBonus(c * cellSz, r * cellSz, "+50 ⭐"); }
          if (cl.bonus === "gem") { addScore(100); playBonusFound(); showBonus(c * cellSz, r * cellSz, "+100 💎"); }
          if (cl.bonus === "combo") { bumpCombo(); bumpCombo(); bumpCombo(); playBonusFound(); showBonus(c * cellSz, r * cellSz, "⚡ COMBO"); }
        }
      }
    }
    return nb;
  }, [cellSz, addScore, bumpCombo, showBonus]);

  // ─── Power-up helpers ───────────────────────────────────
  const activatePU = useCallback((type: PowerUpType) => {
    const def = PU_DEFS.find(p => p.type === type)!;
    setInventory(inv => {
      const idx = inv.indexOf(type);
      if (idx === -1) return inv;
      const next = [...inv]; next.splice(idx, 1); return next;
    });
    if (def.passive) {
      if (type === "shield") { setShieldActive(true); playPowerUpActivate(); }
      if (type === "freeze") { setFrozen(true); playFreezeSfx(); addScore(50); }
    } else {
      setActiveMode(type as Exclude<PowerUpType, "shield" | "freeze">);
      playPowerUpActivate();
    }
  }, [addScore]);

  const useHint = useCallback(() => {
    const safe: string[] = [];
    for (let r = 0; r < cfg.rows; r++) for (let c = 0; c < cfg.cols; c++) {
      const cl = board[r][c];
      if (!cl.isMine && !cl.isRevealed && !cl.isFlagged) safe.push(`${r},${c}`);
    }
    for (let i = safe.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [safe[i], safe[j]] = [safe[j], safe[i]]; }
    const picks = new Set(safe.slice(0, 3));
    setHintCells(picks);
    playHintSfx();
    setActiveMode(null);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHintCells(new Set()), 3000);
  }, [board, cfg]);

  const useRadar = useCallback((r: number, c: number) => {
    const map = new Map<string, boolean>();
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < cfg.rows && nc >= 0 && nc < cfg.cols) {
        map.set(`${nr},${nc}`, board[nr][nc].isMine);
      }
    }
    setRadarCells(map);
    playRadarPing();
    setActiveMode(null);
    if (radarTimer.current) clearTimeout(radarTimer.current);
    radarTimer.current = window.setTimeout(() => setRadarCells(new Map()), 2500);
    addScore(20);
  }, [board, cfg, addScore]);

  const useScanner = useCallback((r: number, c: number) => {
    let nb = board;
    for (let j = 0; j < cfg.cols; j++) {
      if (!nb[r][j].isRevealed && !nb[r][j].isMine) {
        const b2 = nb.map(row => row.map(cl => ({ ...cl })));
        b2[r][j].isRevealed = true; b2[r][j].delay = Math.abs(j - c) * 20;
        nb = b2; addScore(10);
      }
    }
    for (let i = 0; i < cfg.rows; i++) {
      if (!nb[i][c].isRevealed && !nb[i][c].isMine) {
        const b2 = nb.map(row => row.map(cl => ({ ...cl })));
        b2[i][c].isRevealed = true; b2[i][c].delay = Math.abs(i - r) * 20;
        nb = b2; addScore(10);
      }
    }
    nb = collectBonuses(board, nb);
    playScannerSfx();
    setBoard(nb);
    setActiveMode(null);
    if (checkWin(nb, cfg.mines)) endWave();
  }, [board, cfg, addScore, collectBonuses]);

  const useDefuser = useCallback((r: number, c: number) => {
    if (!board[r][c].isMine) { setActiveMode(null); return; }
    const nb = board.map(row => row.map(cl => ({ ...cl })));
    nb[r][c].isMine = false;
    // recalc neighbors
    for (let i = 0; i < cfg.rows; i++) for (let j = 0; j < cfg.cols; j++) {
      if (nb[i][j].isMine) continue;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const ni = i + dr, nj = j + dc;
        if (ni >= 0 && ni < cfg.rows && nj >= 0 && nj < cfg.cols && nb[ni][nj].isMine) n++;
      }
      nb[i][j].neighborMines = n;
    }
    playDefuseSfx();
    setBoard(nb);
    setActiveMode(null);
    addScore(100);
  }, [board, cfg, addScore]);

  // ─── End wave ───────────────────────────────────────────
  const endWave = useCallback(() => {
    playWaveComplete(); stopTimer();
    const waveScore = wave * 100;
    const timeBonus = Math.max(0, (300 - time) * wave);
    const st = starRating(time, wave);
    setTotalStars(ts => ts + st);
    addScore(waveScore + timeBonus);
    playStar(st);
    spawnParticles(30 + wave * 3);

    // Generate 3 random power-up choices
    const types: PowerUpType[] = ["shield", "scanner", "defuser", "radar", "freeze", "hint"];
    const shuffled = [...types].sort(() => Math.random() - .5);
    setWaveChoices(shuffled.slice(0, 3));
    setPickedChoice(false);
    setPhase("waveComplete");
  }, [wave, time, addScore, spawnParticles, stopTimer]);

  // ─── Left click ─────────────────────────────────────────
  const handleL = useCallback((r: number, c: number) => {
    if (phase === "gameOver" || phase === "waveComplete") return;
    const cl = board[r][c];

    // Active power-up targeting
    if (activeMode) {
      if (activeMode === "hint") { useHint(); return; }
      if (activeMode === "radar") { useRadar(r, c); return; }
      if (activeMode === "scanner") { useScanner(r, c); return; }
      if (activeMode === "defuser") { useDefuser(r, c); return; }
    }

    // Chord click
    if (cl.isRevealed && cl.neighborMines > 0) {
      let flagged = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < cfg.rows && nc >= 0 && nc < cfg.cols && board[nr][nc].isFlagged) flagged++;
      }
      if (flagged === cl.neighborMines) {
        let nb = board;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < cfg.rows && nc >= 0 && nc < cfg.cols) {
            const nc2 = nb[nr][nc];
            if (!nc2.isRevealed && !nc2.isFlagged && !nc2.isMine) {
              if (nc2.neighborMines === 0) { nb = flood(nb, cfg.rows, cfg.cols, nr, nc); playFlood(); }
              else { const b2 = nb.map(row => row.map(x => ({ ...x }))); b2[nr][nc].isRevealed = true; b2[nr][nc].delay = 0; nb = b2; playReveal(); }
              bumpCombo(); addScore(10);
            }
          }
        }
        nb = collectBonuses(board, nb);
        setBoard(nb);
        if (checkWin(nb, cfg.mines)) endWave();
      }
      return;
    }
    if (cl.isRevealed || cl.isFlagged) return;

    let nb = board;
    if (firstClick.current) {
      firstClick.current = false;
      nb = placeMines(board, cfg.rows, cfg.cols, cfg.mines, r, c);
      setPhase("playing"); startTimer();
    }

    const clicked = nb[r][c];
    if (clicked.isMine) {
      // Shield check
      if (shieldActive) {
        setShieldActive(false);
        playShieldAbsorb();
        const b2 = nb.map(row => row.map(x => ({ ...x })));
        b2[r][c].isMine = false;
        // recalc
        for (let i = 0; i < cfg.rows; i++) for (let j = 0; j < cfg.cols; j++) {
          if (b2[i][j].isMine) continue;
          let n = 0;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const ni = i + dr, nj = j + dc;
            if (ni >= 0 && ni < cfg.rows && nj >= 0 && nj < cfg.cols && b2[ni][nj].isMine) n++;
          }
          b2[i][j].neighborMines = n;
        }
        b2[r][c].isRevealed = true; b2[r][c].delay = 0;
        setBoard(b2); addScore(50);
        spawnParticles(10);
        return;
      }
      // BOOM
      playExplosion(); setTimeout(() => { playGameOver(); }, 300);
      setBoard(revealAll(nb));
      setPhase("gameOver"); stopTimer();
      setShake(true); setTimeout(() => setShake(false), 600);
      return;
    }

    if (clicked.neighborMines === 0) {
      nb = flood(nb, cfg.rows, cfg.cols, r, c); playFlood();
    } else {
      const b2 = nb.map(row => row.map(x => ({ ...x })));
      b2[r][c].isRevealed = true; b2[r][c].delay = 0; nb = b2; playReveal();
    }
    bumpCombo(); addScore(10);
    nb = collectBonuses(board, nb);
    setBoard(nb);
    if (checkWin(nb, cfg.mines)) endWave();
  }, [phase, board, cfg, activeMode, shieldActive, addScore, bumpCombo, collectBonuses, startTimer, stopTimer, spawnParticles, endWave, useHint, useRadar, useScanner, useDefuser]);

  // ─── Right click ────────────────────────────────────────
  const handleR = useCallback((r: number, c: number, e: React.MouseEvent) => {
    e.preventDefault();
    if (phase !== "playing" && phase !== "idle") return;
    const cl = board[r][c];
    if (cl.isRevealed) return;
    const b2 = board.map(row => row.map(x => ({ ...x })));
    b2[r][c].isFlagged = !b2[r][c].isFlagged;
    setFlagCnt(f => b2[r][c].isFlagged ? f + 1 : Math.max(0, f - 1));
    b2[r][c].isFlagged ? playFlag() : playUnflag();
    setBoard(b2);
  }, [phase, board]);

  // ─── Mobile toggle click ────────────────────────────────
  const handleMobileL = useCallback((r: number, c: number) => {
    if (mobileMode === "flag") {
      handleR(r, c, { preventDefault: () => {} } as React.MouseEvent);
    } else {
      handleL(r, c);
    }
  }, [mobileMode, handleL, handleR]);

  // ─── Computed values ────────────────────────────────────
  const minesLeft = cfg.mines - flagCnt;
  const face = phase === "playing" ? "😊" : phase === "gameOver" ? "😵" : phase === "waveComplete" ? "😎" : "🙂";
  const wavePct = useMemo(() => {
    let revealed = 0, safe = 0;
    for (const row of board) for (const cl of row) {
      if (!cl.isMine) { safe++; if (cl.isRevealed) revealed++; }
    }
    return safe > 0 ? Math.round((revealed / safe) * 100) : 0;
  }, [board]);

  const puDef = activeMode ? PU_DEFS.find(p => p.type === activeMode) : null;

  // ─── Music init ─────────────────────────────────────────
  useEffect(() => {
    const kick = () => { if (!musicEnabled) { startAmbientMusic(); setMusicEnabled(true); } };
    window.addEventListener("click", kick, { once: true });
    return () => window.removeEventListener("click", kick);
  }, [musicEnabled]);

  // ─── Render ─────────────────────────────────────────────
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 text-white">
      {/* Bg pattern */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.025]"
        style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.5) 1px,transparent 1px)", backgroundSize: "50px 50px" }} />
      <div className="pointer-events-none fixed -top-1/3 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-blue-600/8 blur-[100px]" />
      <div className="pointer-events-none fixed -bottom-1/4 right-1/4 h-[400px] w-[500px] rounded-full bg-purple-600/6 blur-[80px]" />

      {/* Particles */}
      <div className="pointer-events-none fixed inset-0 z-50">
        {particles.map(p => (
          <div key={p.id} className="particle"
            style={{ left: `${p.x}%`, top: `${p.y}%`, width: 8, height: 8, backgroundColor: p.color, transform: `translate(${p.dx}px, ${p.dy}px)` }} />
        ))}
      </div>

      {/* Bonus floats */}
      <div className="pointer-events-none fixed inset-0 z-40">
        {bonusFloats.map(b => (
          <div key={b.id} className="anim-float-up absolute text-lg font-black text-yellow-300 drop-shadow-lg"
            style={{ left: b.x, top: b.y }}>{b.text}</div>
        ))}
      </div>

      {/* Modals */}
      {phase === "onboarding" && <OnboardingModal step={onboardStep} onNext={() => setOnboardStep(s => s + 1)} onPrev={() => setOnboardStep(s => s - 1)} onClose={() => { setPhase("idle"); playClick(); }} />}
      {phase === "waveComplete" && <WaveCompleteModal wave={wave} time={time} score={score} comboMax={comboMax} choices={waveChoices} onPick={t => { if (!pickedChoice) { setInventory(inv => [...inv, t]); setPickedChoice(true); playPowerUpPickup(); } }} onNext={startNextWave} />}
      {phase === "gameOver" && <GameOverModal wave={wave} score={score} onRestart={restartGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}

      {/* Main layout */}
      <div className="relative z-10 mx-auto flex min-h-screen flex-col items-center gap-3 p-3 sm:gap-4 sm:p-4">

        {/* ─── Header ─── */}
        <header className="anim-fade-in text-center">
          <h1 className="anim-title bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-3xl font-black tracking-tight text-transparent sm:text-4xl">
            Mine de Rien
          </h1>
          <p className="text-[11px] text-zinc-600">Créé par <span className="font-semibold text-zinc-500">Hylst — Geoffroy</span> avec l'aide d'une IA</p>
        </header>

        {/* ─── Toolbar ─── */}
        <div className="anim-fade-in flex flex-wrap items-center justify-center gap-2" style={{ animationDelay: "80ms" }}>
          {/* Wave badge */}
          <div className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/20 px-3 py-1.5">
            <span className="text-xs text-purple-400 font-semibold">VAGUE</span>
            <span className="text-lg font-black text-white">{wave}</span>
          </div>
          {/* Score */}
          <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-1.5">
            <span className="text-xs text-zinc-500">SCORE</span>
            <span className="text-lg font-black text-amber-400">{score}</span>
          </div>
          {/* High score */}
          <div className="hidden sm:flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-1.5">
            <span className="text-xs text-zinc-500">RECORD</span>
            <span className="text-lg font-black text-emerald-400">{highScore}</span>
          </div>
          {/* Stars */}
          <div className="flex items-center gap-1 rounded-xl bg-white/5 border border-white/10 px-3 py-1.5">
            <span className="text-sm">⭐</span>
            <span className="text-sm font-bold text-yellow-400">{totalStars}</span>
          </div>
          {/* Buttons */}
          <button onClick={() => { setMusicEnabled(toggleMusic()); playClick(); }} title="Musique"
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-base transition ${musicEnabled ? "bg-blue-600/30 text-blue-400" : "bg-white/5 text-zinc-500 hover:bg-white/10"}`}>{musicEnabled ? "🎵" : "🔇"}</button>
          <button onClick={() => setShowSettings(s => !s)} title="Paramètres"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-base text-zinc-400 hover:bg-white/10 transition">⚙️</button>
          <button onClick={() => setShowRules(true)} title="Règles"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-base text-zinc-400 hover:bg-white/10 transition">📜</button>
          <button onClick={() => { setOnboardStep(0); setPhase("onboarding"); }} title="Tutoriel"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-base text-zinc-400 hover:bg-white/10 transition">❓</button>
        </div>

        {/* Settings */}
        {showSettings && (
          <div className="glass anim-bounce-in w-full max-w-xs rounded-xl p-4">
            <h3 className="mb-2 text-sm font-semibold text-zinc-300">🔊 Volume</h3>
            <input type="range" min={0} max={100} value={volume} onChange={e => { const v = Number(e.target.value); setVolume(v); setMasterVolume(v / 100); }} className="w-full accent-blue-500" />
            <p className="mt-1 text-center text-xs text-zinc-500">{volume}%</p>
          </div>
        )}

        {/* ─── Active power-up banner ─── */}
        {puDef && (
          <div className={`anim-slide-down flex items-center gap-2 rounded-xl border bg-gradient-to-r ${puDef.bgColor} px-4 py-2 text-sm`}>
            <span className="text-lg">{puDef.emoji}</span>
            <span className="text-white font-medium">{puDef.name} actif — cliquez sur une cellule</span>
            <button onClick={() => { setActiveMode(null); playClick(); }} className="ml-2 rounded bg-black/20 px-2 py-0.5 text-xs text-zinc-300 hover:bg-black/30">Annuler ✕</button>
          </div>
        )}

        {/* ─── Game Panel ─── */}
        <div className={`anim-fade-in ${shake ? "anim-shake" : ""}`} style={{ animationDelay: "120ms" }}>
          <div className="rounded-2xl bg-gradient-to-b from-zinc-800 to-zinc-900 p-2.5 shadow-2xl ring-1 ring-white/10 sm:p-3">

            {/* HUD */}
            <div className="scanlines relative mb-2.5 flex items-center justify-between gap-3 rounded-xl bg-zinc-950 px-3 py-2 shadow-inner sm:px-4">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-600">💣</span>
                <div className="rounded bg-black/80 px-2 py-0.5 font-mono text-lg tabular-nums tracking-wider text-red-500 anim-neon">{Pad3(minesLeft)}</div>
              </div>
              <button type="button" onClick={() => { playClick(); restartGame(); }} className="text-2xl leading-none transition hover:scale-110 active:scale-90 drop-shadow-lg" aria-label="Recommencer">{face}</button>
              <div className="flex items-center gap-2">
                {combo > 1 && (
                  <span className={`text-sm font-black ${comboPop ? "anim-combo-pop" : ""} ${combo >= 10 ? "text-red-400" : combo >= 5 ? "text-amber-400" : "text-blue-400"}`}>
                    ×{combo}
                  </span>
                )}
                {frozen && <span className="text-sm anim-sparkle">❄️</span>}
                {shieldActive && <span className="text-sm anim-glow">🛡️</span>}
                <div className="rounded bg-black/80 px-2 py-0.5 font-mono text-lg tabular-nums tracking-wider text-red-500 anim-neon">{Pad3(time)}</div>
              </div>
            </div>

            {/* Board */}
            <div style={{ perspective: 800 }}>
              <div className="board-3d"
                style={{
                  display: "grid", gridTemplateColumns: `repeat(${cfg.cols}, ${cellSz}px)`,
                  gap: 1, background: "rgba(113,113,122,.25)", borderRadius: 8, padding: 2,
                }}>
                {board.map((row, r) => row.map((cl, c) => (
                  <CellBtn key={`${r}-${c}`} cl={cl} r={r} c={c} sz={cellSz}
                    onL={isTouch.current ? handleMobileL : handleL} onR={handleR}
                    hintCells={hintCells} radarCells={radarCells} active={activeMode} />
                )))}
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-2.5 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div className="progress-fill h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500" style={{ width: `${wavePct}%` }} />
              </div>
              <span className="text-[10px] text-zinc-500 font-mono w-8 text-right">{wavePct}%</span>
            </div>
          </div>
        </div>

        {/* ─── Power-up inventory ─── */}
        {inventory.length > 0 && (
          <div className="anim-slide-up flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-zinc-500 mr-1">Bonus :</span>
            {inventory.map((t, i) => {
              const d = PU_DEFS.find(p => p.type === t)!;
              return (
                <button key={i} onClick={() => activatePU(t)} title={`${d.name} — ${d.desc}`}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border bg-gradient-to-b ${d.bgColor} text-lg transition hover:scale-110 active:scale-95 ${activeMode === t ? "ring-2 ring-white/50 anim-glow" : ""}`}>
                  {d.emoji}
                </button>
              );
            })}
          </div>
        )}

        {/* ─── Mobile mode toggle ─── */}
        {isTouch.current && (phase === "playing" || phase === "idle") && (
          <div className="flex items-center gap-2">
            <button onClick={() => setMobileMode("reveal")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${mobileMode === "reveal" ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>
              👆 Révéler
            </button>
            <button onClick={() => setMobileMode("flag")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${mobileMode === "flag" ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>
              🚩 Drapeau
            </button>
          </div>
        )}

        {/* ─── Status messages ─── */}
        <div className="anim-fade-in text-center" style={{ animationDelay: "180ms" }}>
          {phase === "idle" && (
            <p className="text-xs text-zinc-500">
              Vague {wave} · Grille {cfg.rows}×{cfg.cols} · {cfg.mines} mines
              <br /><span className="text-zinc-600">Clic gauche = révéler · Clic droit = drapeau · Premier clic toujours sûr</span>
            </p>
          )}
          {phase === "playing" && (
            <p className="text-xs text-zinc-500">
              Vague {wave} · {minesLeft} mines restantes · {wavePct}% révélé
            </p>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-auto pb-2 text-center text-[10px] text-zinc-700">
          Mine de Rien — Hylst · Geoffroy · 2025
        </footer>
      </div>
    </div>
  );
}
