import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  ComposedChart, Area, Line, Bar, BarChart, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";

// ═══════════════════════════════════════════════════════════════
// FONTS & GLOBAL STYLES
// ═══════════════════════════════════════════════════════════════
const FONT = "'DM Sans', sans-serif";
const SERIF = "'Playfair Display', serif";

const PALETTE = {
  bg: "#ecece3",
  card: "#FFFFFF",
  cardAlt: "#f5f5f0",
  border: "#d9d9d0",
  borderLight: "#e4e4db",
  text: "#1d1e1c",
  textMuted: "#6b6b65",
  textLight: "#9a9a93",
  accent: "#f5b5c2",
  accentLight: "#f8cdd6",
  accentBg: "#fdf0f3",
  green: "#5a8a4a",
  greenLight: "#7aaa6a",
  greenBg: "#eef5eb",
  dusk: "#c4a05a",
  duskLight: "#d4b97a",
  duskBg: "#fdf8ee",
  warm: "#fdd160",
  warmLight: "#fde08a",
  dark: "#1d1e1c",
  scenarioA: "#f5b5c2",
  scenarioB: "#fdd160",
  scenarioC: "#1d1e1c",
  scenarioD: "#c4a05a",
  scenarioE: "#9a9a93",
  tooltipBg: "#1d1e1c",
  tooltipText: "#ecece3",
};

const SCENARIO_COLORS = [PALETTE.scenarioA, PALETTE.scenarioB, PALETTE.scenarioC, PALETTE.scenarioD, PALETTE.scenarioE];

// ═══════════════════════════════════════════════════════════════
// DEFAULT DATA (from spreadsheet)
// ═══════════════════════════════════════════════════════════════
const DEFAULT_BULK_PRODUCTS = [
  { id: "ev1", name: "Everyday Cafe Bag 1lb", sizeLbs: 1, servings: 180, wholesale: 80, cogs: 12.93 },
  { id: "ev5", name: "Everyday Cafe Bag 5lb", sizeLbs: 5, servings: 900, wholesale: 300, cogs: 60 },
  { id: "dk5", name: "Dusk Cafe Bag 5lb", sizeLbs: 5, servings: 107, wholesale: 108, cogs: 53 },
  { id: "dk10", name: "Dusk Cafe Bag 10lb", sizeLbs: 10, servings: 214, wholesale: 195, cogs: 100 },
];

const DEFAULT_RETAIL_PRODUCTS = [
  { id: "evp", name: "Everyday Pouch", retailPrice: 24, wholesalePrice: 12, cogs: 4 },
  { id: "dkp", name: "Dusk Pouch", retailPrice: 24, wholesalePrice: 12, cogs: 8 },
];

const DEFAULT_TIERS = [
  { id: "small", label: "Small Cafe", bulkProductIds: ["ev1"], drinksPerDay: 10, tspPerDrink: 1, daysPerMonth: 30, retailProductIds: ["evp"], retailUnitsPerMonth: 10 },
  { id: "medium", label: "Medium Cafe", bulkProductIds: ["ev5"], drinksPerDay: 40, tspPerDrink: 1, daysPerMonth: 30, retailProductIds: ["evp"], retailUnitsPerMonth: 15 },
  { id: "large", label: "Large Cafe", bulkProductIds: ["ev5", "dk5"], drinksPerDay: 60, tspPerDrink: 1, daysPerMonth: 30, retailProductIds: ["evp", "dkp"], retailUnitsPerMonth: 25 },
];

const DEFAULT_SCENARIOS = [
  { name: "Base Case", startingPartners: 1, newPartnersPerMonth: 2, pctSmall: 50, pctMedium: 35, pctLarge: 15, monthlyChurnPct: 2, retailAttachPct: 50, color: PALETTE.scenarioA },
  { name: "Aggressive", startingPartners: 1, newPartnersPerMonth: 4, pctSmall: 35, pctMedium: 40, pctLarge: 25, monthlyChurnPct: 3, retailAttachPct: 75, color: PALETTE.scenarioB },
  { name: "Conservative", startingPartners: 1, newPartnersPerMonth: 1, pctSmall: 60, pctMedium: 30, pctLarge: 10, monthlyChurnPct: 1, retailAttachPct: 30, color: PALETTE.scenarioC },
];

// ═══════════════════════════════════════════════════════════════
// CALCULATION ENGINE
// ═══════════════════════════════════════════════════════════════
function calcBulkMargin(p) { return p.wholesale - p.cogs; }
function calcBulkMarginPct(p) { return p.wholesale > 0 ? ((p.wholesale - p.cogs) / p.wholesale) : 0; }
function calcRetailMargin(p) { return p.wholesalePrice - p.cogs; }

function calcTierEconomics(tier, bulkProducts, retailProducts) {
  const selectedBulk = bulkProducts.filter(p => (tier.bulkProductIds || []).includes(p.id));
  const selectedRetail = retailProducts.filter(p => (tier.retailProductIds || []).includes(p.id));

  const totalServingsPerMonth = tier.drinksPerDay * tier.tspPerDrink * tier.daysPerMonth;
  const servingsPerProduct = selectedBulk.length > 0 ? totalServingsPerMonth / selectedBulk.length : 0;

  let bulkRev = 0, bulkProfit = 0;
  const bulkBreakdown = selectedBulk.map(bulk => {
    const bags = bulk.servings > 0 ? servingsPerProduct / bulk.servings : 0;
    const rev = bags * bulk.wholesale;
    const profit = bags * calcBulkMargin(bulk);
    bulkRev += rev;
    bulkProfit += profit;
    return { name: bulk.name, bags: Math.round(bags * 100) / 100, rev: Math.round(rev * 100) / 100 };
  });

  const retailUnitsPerProduct = selectedRetail.length > 0 ? tier.retailUnitsPerMonth / selectedRetail.length : 0;
  let retailRev = 0, retailProfit = 0;
  selectedRetail.forEach(retail => {
    retailRev += retailUnitsPerProduct * retail.wholesalePrice;
    retailProfit += retailUnitsPerProduct * calcRetailMargin(retail);
  });

  return {
    servingsPerMonth: totalServingsPerMonth,
    bulkBreakdown,
    bulkRev: Math.round(bulkRev * 100) / 100, bulkProfit: Math.round(bulkProfit * 100) / 100,
    retailRev, retailProfit,
    totalRev: Math.round((bulkRev + retailRev) * 100) / 100,
    totalProfit: Math.round((bulkProfit + retailProfit) * 100) / 100,
  };
}

function projectScenario(scenario, tiers, bulkProducts, retailProducts) {
  const tierEcon = {};
  tiers.forEach(t => { tierEcon[t.id] = calcTierEconomics(t, bulkProducts, retailProducts); });

  const tierMap = { small: tiers[0]?.id, medium: tiers[1]?.id, large: tiers[2]?.id };
  const sF = scenario.pctSmall / 100;
  const mF = scenario.pctMedium / 100;
  const lF = scenario.pctLarge / 100;
  const churn = scenario.monthlyChurnPct / 100;
  const retailAttach = scenario.retailAttachPct / 100;

  let totalActive = scenario.startingPartners;
  const months = [];
  let cumulativeRev = 0, cumulativeProfit = 0;

  for (let m = 1; m <= 12; m++) {
    if (m > 1) totalActive = totalActive * (1 - churn) + scenario.newPartnersPerMonth;
    const counts = { small: totalActive * sF, medium: totalActive * mF, large: totalActive * lF };

    let bulkRev = 0, bulkProfit = 0, retailRev = 0, retailProfit = 0;
    ["small", "medium", "large"].forEach(size => {
      const tid = tierMap[size];
      if (tid && tierEcon[tid]) {
        bulkRev += counts[size] * tierEcon[tid].bulkRev;
        bulkProfit += counts[size] * tierEcon[tid].bulkProfit;
        // Retail attach rate from scenario: % of bulk partners who also stock retail
        retailRev += counts[size] * tierEcon[tid].retailRev * retailAttach;
        retailProfit += counts[size] * tierEcon[tid].retailProfit * retailAttach;
      }
    });

    const totalRev = bulkRev + retailRev;
    const totalProfit = bulkProfit + retailProfit;
    cumulativeRev += totalRev;
    cumulativeProfit += totalProfit;

    months.push({
      month: m, label: `M${m}`,
      totalActive: Math.round(totalActive * 100) / 100,
      small: Math.round(counts.small * 100) / 100,
      medium: Math.round(counts.medium * 100) / 100,
      large: Math.round(counts.large * 100) / 100,
      bulkRevenue: Math.round(bulkRev), retailRevenue: Math.round(retailRev),
      totalRevenue: Math.round(totalRev), bulkProfit: Math.round(bulkProfit),
      retailProfit: Math.round(retailProfit), totalProfit: Math.round(totalProfit),
      marginPct: totalRev > 0 ? Math.round((totalProfit / totalRev) * 1000) / 10 : 0,
      cumulativeRev: Math.round(cumulativeRev), cumulativeProfit: Math.round(cumulativeProfit),
    });
  }
  return months;
}

// ═══════════════════════════════════════════════════════════════
// FORMATTING
// ═══════════════════════════════════════════════════════════════
const fmt = (n) => {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
};
const fmtFull = (n) => `$${Math.round(n).toLocaleString()}`;
const pct = (n) => `${Math.round(n * 1000) / 10}%`;

// ═══════════════════════════════════════════════════════════════
// INFO TOOLTIP COMPONENT
// ═══════════════════════════════════════════════════════════════
function InfoTip({ text, children, inline = false }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);

  const handleEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left + rect.width / 2 - 120, window.innerWidth - 260)) });
    }
    setShow(true);
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, position: "relative" }}>
      {children}
      <span
        ref={triggerRef}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 14, height: 14, borderRadius: "50%", background: PALETTE.border,
          color: PALETTE.textMuted, fontSize: 9, fontWeight: 700, cursor: "help",
          flexShrink: 0, fontFamily: FONT, lineHeight: 1, userSelect: "none",
        }}
      >?</span>
      {show && (
        <div style={{
          position: "fixed", top: pos.top, left: pos.left, zIndex: 9999,
          background: PALETTE.tooltipBg, color: PALETTE.tooltipText,
          borderRadius: 10, padding: "10px 14px", fontSize: 11, lineHeight: 1.5,
          fontFamily: FONT, fontWeight: 400, maxWidth: 260, minWidth: 160,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)", pointerEvents: "none",
        }}>
          {text}
        </div>
      )}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// UI COMPONENTS
// ═══════════════════════════════════════════════════════════════

function NumInput({ value, onChange, prefix = "", suffix = "", min, max, step = 1, small = false }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", background: PALETTE.cardAlt, borderRadius: 8, padding: small ? "3px 8px" : "5px 10px", border: `1px solid ${PALETTE.border}`, gap: 2, minWidth: small ? 60 : 80 }}>
      {prefix && <span style={{ fontSize: small ? 11 : 12, color: PALETTE.textMuted }}>{prefix}</span>}
      <input
        type="number" value={value} min={min} max={max} step={step}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        style={{ width: small ? 48 : 64, background: "none", border: "none", outline: "none", fontSize: small ? 12 : 13, fontWeight: 600, color: PALETTE.text, fontFamily: FONT, textAlign: "right" }}
      />
      {suffix && <span style={{ fontSize: small ? 11 : 12, color: PALETTE.textMuted }}>{suffix}</span>}
    </div>
  );
}

function SliderRow({ label, value, onChange, min, max, step = 1, suffix = "", prefix = "", tip }) {
  const labelEl = <span style={{ fontSize: 12, color: PALETTE.textMuted, fontFamily: FONT }}>{label}</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {tip ? <InfoTip text={tip}>{labelEl}</InfoTip> : labelEl}
        <span style={{ fontSize: 13, fontWeight: 600, color: PALETTE.text, fontFamily: FONT }}>{prefix}{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: PALETTE.dark, height: 3, cursor: "pointer" }}
      />
    </div>
  );
}

function CheckboxGroup({ options, values, onChange, name }) {
  const toggle = (id) => {
    if (values.includes(id)) {
      if (values.length > 1) onChange(values.filter(v => v !== id));
    } else {
      onChange([...values, id]);
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {options.map(opt => {
        const selected = values.includes(opt.id);
        return (
          <label key={opt.id} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 12px", borderRadius: 10, cursor: "pointer",
            background: selected ? PALETTE.accentBg : PALETTE.bg,
            border: `1.5px solid ${selected ? PALETTE.accent : PALETTE.borderLight}`,
            transition: "all 0.15s",
          }}>
            <input type="checkbox" checked={selected} onChange={() => toggle(opt.id)}
              style={{ accentColor: PALETTE.dark, margin: 0, width: 14, height: 14, cursor: "pointer" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: selected ? 600 : 500, color: selected ? PALETTE.text : PALETTE.textMuted, fontFamily: FONT }}>{opt.name}</span>
              {opt.detail && <span style={{ fontSize: 10, color: PALETTE.textLight, fontFamily: FONT }}>{opt.detail}</span>}
            </div>
          </label>
        );
      })}
    </div>
  );
}

function Card({ children, title, subtitle, style = {}, headerRight, titleTip }) {
  return (
    <div style={{ background: PALETTE.card, borderRadius: 16, border: `1px solid ${PALETTE.border}`, overflow: "hidden", ...style }}>
      {(title || subtitle) && (
        <div style={{ padding: "20px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            {title && (
              <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text, fontFamily: FONT, margin: 0, display: "flex", alignItems: "center", gap: 0 }}>
                {titleTip ? <InfoTip text={titleTip}><span>{title}</span></InfoTip> : title}
              </h3>
            )}
            {subtitle && <p style={{ fontSize: 12, color: PALETTE.textMuted, margin: "3px 0 0", fontFamily: FONT }}>{subtitle}</p>}
          </div>
          {headerRight}
        </div>
      )}
      <div style={{ padding: "16px 24px 24px" }}>{children}</div>
    </div>
  );
}

function KPI({ label, value, sub, highlight = false, tip }) {
  return (
    <div style={{
      background: highlight ? `linear-gradient(135deg, ${PALETTE.dark}, #3a3b38)` : PALETTE.card,
      borderRadius: 14, padding: "20px 22px", border: highlight ? "none" : `1px solid ${PALETTE.border}`,
      display: "flex", flexDirection: "column", gap: 3, minWidth: 0,
    }}>
      <InfoTip text={tip} inline>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: highlight ? "rgba(255,255,255,0.7)" : PALETTE.textMuted, fontFamily: FONT }}>{label}</span>
      </InfoTip>
      <span style={{ fontSize: 26, fontWeight: 700, color: highlight ? "#fff" : PALETTE.text, fontFamily: SERIF, lineHeight: 1.1 }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: highlight ? "rgba(255,255,255,0.6)" : PALETTE.textLight, fontFamily: FONT }}>{sub}</span>}
    </div>
  );
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 2, background: PALETTE.cardAlt, borderRadius: 10, padding: 3, flexWrap: "wrap" }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          background: active === t.key ? PALETTE.card : "transparent",
          color: active === t.key ? PALETTE.text : PALETTE.textMuted,
          border: active === t.key ? `1px solid ${PALETTE.border}` : "1px solid transparent",
          borderRadius: 8, padding: "7px 14px", fontSize: 11, fontWeight: 600,
          cursor: "pointer", fontFamily: FONT, transition: "all 0.15s", whiteSpace: "nowrap",
        }}>{t.label}</button>
      ))}
    </div>
  );
}

function SectionNav({ sections, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", padding: "0 32px", marginBottom: 24 }}>
      {sections.map(s => (
        <button key={s.key} onClick={() => onChange(s.key)} style={{
          background: active === s.key ? PALETTE.text : "transparent",
          color: active === s.key ? PALETTE.bg : PALETTE.textMuted,
          border: `1px solid ${active === s.key ? PALETTE.text : PALETTE.border}`,
          borderRadius: 20, padding: "8px 18px", fontSize: 12, fontWeight: 600,
          cursor: "pointer", fontFamily: FONT, transition: "all 0.2s",
        }}>{s.icon} {s.label}</button>
      ))}
    </div>
  );
}

function Th({ children, tip }) {
  const inner = <span>{children}</span>;
  return (
    <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: PALETTE.textMuted }}>
      {tip ? <InfoTip text={tip}>{inner}</InfoTip> : inner}
    </th>
  );
}

// ═══════════════════════════════════════════════════════════════
// CUSTOM CHART TOOLTIP
// ═══════════════════════════════════════════════════════════════
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 10, padding: "10px 14px", fontFamily: FONT, boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: PALETTE.text, marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: PALETTE.textMuted, marginBottom: 2 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color || p.stroke }} />
          <span>{p.name}:</span>
          <span style={{ fontWeight: 600, color: PALETTE.text }}>{typeof p.value === "number" && Math.abs(p.value) > 50 ? fmtFull(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════
export default function RitualPowdersDashboard() {
  const [bulkProducts, setBulkProducts] = useState(DEFAULT_BULK_PRODUCTS);
  const [retailProducts, setRetailProducts] = useState(DEFAULT_RETAIL_PRODUCTS);
  const [tiers, setTiers] = useState(DEFAULT_TIERS);
  const [scenarios, setScenarios] = useState(DEFAULT_SCENARIOS);
  const [activeSection, setActiveSection] = useState("projections");
  const [chartMetric, setChartMetric] = useState("revenue");

  const updateBulk = (idx, field, val) => setBulkProducts(p => p.map((x, i) => i === idx ? { ...x, [field]: val } : x));
  const updateRetail = (idx, field, val) => setRetailProducts(p => p.map((x, i) => i === idx ? { ...x, [field]: val } : x));
  const updateTier = (idx, field, val) => setTiers(t => t.map((x, i) => i === idx ? { ...x, [field]: val } : x));
  const updateScenario = (idx, field, val) => setScenarios(s => s.map((x, i) => i === idx ? { ...x, [field]: val } : x));
  const removeScenario = (idx) => setScenarios(s => s.filter((_, i) => i !== idx));
  const addScenario = () => {
    if (scenarios.length >= 5) return;
    setScenarios(s => [...s, {
      name: `Scenario ${s.length + 1}`, startingPartners: 1, newPartnersPerMonth: 2,
      pctSmall: 50, pctMedium: 35, pctLarge: 15, monthlyChurnPct: 2, retailAttachPct: 50,
      color: SCENARIO_COLORS[s.length] || "#999",
    }]);
  };

  const allProjections = useMemo(() =>
    scenarios.map(s => ({ scenario: s, data: projectScenario(s, tiers, bulkProducts, retailProducts) })),
    [scenarios, tiers, bulkProducts, retailProducts]
  );

  const chartData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const point = { month: i + 1, label: `M${i + 1}` };
      allProjections.forEach(({ scenario, data }) => {
        const d = data[i];
        point[`${scenario.name}_rev`] = d.totalRevenue;
        point[`${scenario.name}_profit`] = d.totalProfit;
        point[`${scenario.name}_partners`] = d.totalActive;
        point[`${scenario.name}_margin`] = d.marginPct;
        point[`${scenario.name}_cumRev`] = d.cumulativeRev;
      });
      return point;
    });
  }, [allProjections]);

  const primary = allProjections[0]?.data;
  const p12 = primary?.[11];
  const p6 = primary?.[5];
  const totalYear = primary?.reduce((s, d) => s + d.totalRevenue, 0) || 0;
  const totalProfitYear = primary?.reduce((s, d) => s + d.totalProfit, 0) || 0;

  const SECTIONS = [
    { key: "projections", label: "Projections", icon: "\u{1F4C8}" },
    { key: "economics", label: "Product Economics", icon: "\u{1F9EE}" },
    { key: "tiers", label: "Cafe Tiers", icon: "\u2615" },
    { key: "scenarios", label: "Scenarios", icon: "\u{1F39B}" },
  ];

  const metricTabs = [
    { key: "revenue", label: "Revenue" },
    { key: "profit", label: "Gross Profit" },
    { key: "partners", label: "Partners" },
    { key: "cumRev", label: "Cumulative Rev" },
  ];

  const metricSuffix = { revenue: "_rev", profit: "_profit", partners: "_partners", cumRev: "_cumRev" };

  const tierEcons = useMemo(() => tiers.map(t => ({
    ...t, econ: calcTierEconomics(t, bulkProducts, retailProducts)
  })), [tiers, bulkProducts, retailProducts]);

  const revSplit = p12 ? [
    { name: "Ingredient Supply", value: p12.bulkRevenue, color: PALETTE.accent },
    { name: "Retail Sellthrough", value: p12.retailRevenue, color: PALETTE.green },
  ] : [];

  return (
    <div style={{ background: PALETTE.bg, minHeight: "100vh", fontFamily: FONT, color: PALETTE.text }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;600;700&display=swap" rel="stylesheet" />
      <style>{`
        input[type=range] { -webkit-appearance: none; appearance: none; background: ${PALETTE.border}; border-radius: 4px; outline: none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: ${PALETTE.dark}; cursor: pointer; border: 2px solid white; box-shadow: 0 1px 4px rgba(0,0,0,0.15); }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { opacity: 1; }
        ::selection { background: ${PALETTE.accentBg}; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.4s ease-out; }
      `}</style>

      {/* HEADER */}
      <div style={{ padding: "40px 32px 24px", borderBottom: `1px solid ${PALETTE.border}` }}>
        <div style={{ maxWidth: 1300, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <img src="/logo.png" alt="Ritual Powders" style={{ height: 120, width: "auto" }} />
              <div>
                <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: PALETTE.dark, fontWeight: 700, marginBottom: 4 }}>B2B Growth Model</div>
                <p style={{ fontSize: 13, color: PALETTE.textMuted, margin: 0, maxWidth: 520 }}>
                  12-month cafe partner growth projections. Edit product economics, tier definitions, and growth scenarios to model different paths.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: PALETTE.greenBg, padding: "6px 14px", borderRadius: 20 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: PALETTE.green }} />
              <span style={{ fontSize: 11, color: PALETTE.green, fontWeight: 600 }}>Live Model</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "24px 0 64px" }}>
        <SectionNav sections={SECTIONS} active={activeSection} onChange={setActiveSection} />

        {/* ═══════════ PROJECTIONS ═══════════ */}
        {activeSection === "projections" && (
          <div className="fade-in" style={{ padding: "0 32px", display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
              <KPI highlight label="M12 Monthly Revenue" tip="Projected total monthly revenue at month 12 (ingredient supply + retail sellthrough), derived from active partner count and per-partner economics." value={fmt(p12?.totalRevenue || 0)} sub={`${fmt((p12?.totalRevenue || 0) * 12)} annualized`} />
              <KPI label="M12 Gross Profit" tip="Monthly gross profit at month 12. Revenue minus COGS across all active partners, weighted by tier mix and retail attach rates." value={fmt(p12?.totalProfit || 0)} sub={`${p12?.marginPct || 0}% margin`} />
              <KPI label="M12 Partners" tip="Total active cafe partners at month 12 after accounting for monthly churn. Breakdown shows Small / Medium / Large tier split." value={Math.round(p12?.totalActive || 0)} sub={`${Math.round(p12?.small||0)}S / ${Math.round(p12?.medium||0)}M / ${Math.round(p12?.large||0)}L`} />
              <KPI label="Year 1 Total Revenue" tip="Sum of all monthly revenue across the full 12-month projection. Not annualized: this is the actual cumulative total." value={fmt(totalYear)} sub={`${fmt(totalProfitYear)} profit`} />
              <KPI label="M6 Revenue" tip="Monthly revenue at the 6-month mark. A useful checkpoint to gauge early traction before the full 12-month picture." value={fmt(p6?.totalRevenue || 0)} sub="Halfway checkpoint" />
            </div>

            <Card title="12-Month Scenario Comparison" titleTip="Plots all active scenarios on the same axis. Switch between Revenue, Gross Profit, Partners, or Cumulative Revenue using the tabs." subtitle="All active scenarios plotted together" headerRight={<TabBar tabs={metricTabs} active={chartMetric} onChange={setChartMetric} />}>
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.borderLight} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: PALETTE.textMuted }} axisLine={{ stroke: PALETTE.border }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: PALETTE.textMuted }} axisLine={false} tickLine={false} tickFormatter={v => chartMetric === "partners" ? v : chartMetric === "margin" ? `${v}%` : fmt(v)} />
                  <Tooltip content={<ChartTooltip />} />
                  {scenarios.map((s, i) => (
                    <Area key={s.name} type="monotone" dataKey={`${s.name}${metricSuffix[chartMetric]}`} name={s.name} stroke={s.color} fill={s.color} fillOpacity={i === 0 ? 0.12 : 0.04} strokeWidth={i === 0 ? 2.5 : 1.5} dot={false} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
                {scenarios.map(s => (
                  <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: PALETTE.textMuted }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color }} />
                    {s.name}
                  </div>
                ))}
              </div>
            </Card>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
              <Card title={`Monthly Breakdown: ${scenarios[0]?.name || "Base"}`} titleTip="Stacked bar showing the two B2B revenue streams for the primary scenario. Ingredient Supply is recurring bulk bag orders. Retail Sellthrough is wholesale pouch revenue, weighted by each tier's partner stocking rate." subtitle="Ingredient supply vs retail sellthrough">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={primary || []} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.borderLight} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: PALETTE.textMuted }} axisLine={{ stroke: PALETTE.border }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: PALETTE.textMuted }} axisLine={false} tickLine={false} tickFormatter={fmt} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="bulkRevenue" name="Ingredient Supply" stackId="rev" fill={PALETTE.accent} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="retailRevenue" name="Retail Sellthrough" stackId="rev" fill={PALETTE.green} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card title="M12 Revenue Split" titleTip="Proportion of month 12 revenue coming from bulk ingredient supply versus retail pouch sellthrough." subtitle="Supply vs sellthrough at month 12">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={revSplit} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value" stroke="none">
                      {revSplit.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(val) => fmtFull(val)} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", justifyContent: "center", gap: 20 }}>
                  {revSplit.map(r => (
                    <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: r.color }} />
                      <span style={{ color: PALETTE.textMuted }}>{r.name}:</span>
                      <span style={{ fontWeight: 600 }}>{fmtFull(r.value)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <Card title="Scenario Summary at Month 12" titleTip="Side-by-side comparison of all scenario outcomes at the 12-month mark, plus cumulative Year 1 totals." subtitle="Side-by-side comparison of all scenarios">
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: FONT }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                      <Th>Scenario</Th>
                      <Th tip="Total active cafe partners at month 12 after churn.">Partners</Th>
                      <Th tip="Total monthly revenue at month 12 (supply + retail).">Monthly Rev</Th>
                      <Th tip="Monthly gross profit at month 12 (revenue minus COGS).">Monthly Profit</Th>
                      <Th tip="Gross margin percentage: profit divided by revenue.">Margin</Th>
                      <Th tip="Sum of all monthly revenue across the 12-month period.">Year 1 Rev</Th>
                      <Th tip="Sum of all monthly profit across the 12-month period.">Year 1 Profit</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {allProjections.map(({ scenario, data }) => {
                      const m12 = data[11];
                      const yr = data.reduce((s, d) => s + d.totalRevenue, 0);
                      const yrP = data.reduce((s, d) => s + d.totalProfit, 0);
                      return (
                        <tr key={scenario.name} style={{ borderBottom: `1px solid ${PALETTE.borderLight}` }}>
                          <td style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 10, height: 10, borderRadius: "50%", background: scenario.color, flexShrink: 0 }} />
                            <span style={{ fontWeight: 600 }}>{scenario.name}</span>
                          </td>
                          <td style={{ padding: "12px 14px" }}>{Math.round(m12.totalActive)}</td>
                          <td style={{ padding: "12px 14px", fontWeight: 600 }}>{fmtFull(m12.totalRevenue)}</td>
                          <td style={{ padding: "12px 14px", color: PALETTE.green }}>{fmtFull(m12.totalProfit)}</td>
                          <td style={{ padding: "12px 14px", color: PALETTE.accent }}>{m12.marginPct}%</td>
                          <td style={{ padding: "12px 14px", fontWeight: 600 }}>{fmt(yr)}</td>
                          <td style={{ padding: "12px 14px", color: PALETTE.green }}>{fmt(yrP)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* ═══════════ PRODUCT ECONOMICS ═══════════ */}
        {activeSection === "economics" && (
          <div className="fade-in" style={{ padding: "0 32px", display: "flex", flexDirection: "column", gap: 24 }}>
            <Card title="Bulk Products" titleTip="Cafe-size bags sold as ingredient supply. Wholesale price and COGS drive per-bag margin. Servings per bag determines how many bags a cafe needs based on their daily drink volume." subtitle="Edit wholesale pricing and COGS to see margin impact across projections">
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: FONT }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                      <Th>Product</Th>
                      <Th tip="Physical weight of the bag. Informational only, does not affect calculations.">Size (lbs)</Th>
                      <Th tip="Number of individual drink servings per bag. Determines how many bags a cafe orders monthly based on daily drink volume.">Servings/Bag</Th>
                      <Th tip="Price Ritual Powders charges the cafe per bag. B2B wholesale, not end-consumer pricing.">Wholesale</Th>
                      <Th tip="Cost of goods sold per bag: production, packaging, and ingredient costs.">COGS</Th>
                      <Th tip="Wholesale price minus COGS. Gross profit earned per bag sold.">Margin</Th>
                      <Th tip="Gross margin as a percentage of wholesale price.">Margin %</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkProducts.map((p, i) => (
                      <tr key={p.id} style={{ borderBottom: `1px solid ${PALETTE.borderLight}` }}>
                        <td style={{ padding: "12px", fontWeight: 600, minWidth: 160 }}>{p.name}</td>
                        <td style={{ padding: "12px" }}><NumInput value={p.sizeLbs} onChange={v => updateBulk(i, "sizeLbs", v)} small min={0.5} step={0.5} suffix="lb" /></td>
                        <td style={{ padding: "12px" }}><NumInput value={p.servings} onChange={v => updateBulk(i, "servings", v)} small min={1} /></td>
                        <td style={{ padding: "12px" }}><NumInput value={p.wholesale} onChange={v => updateBulk(i, "wholesale", v)} prefix="$" min={0} /></td>
                        <td style={{ padding: "12px" }}><NumInput value={p.cogs} onChange={v => updateBulk(i, "cogs", v)} prefix="$" min={0} step={0.01} /></td>
                        <td style={{ padding: "12px", fontWeight: 600, color: PALETTE.green }}>{fmtFull(calcBulkMargin(p))}</td>
                        <td style={{ padding: "12px" }}>
                          <span style={{ background: calcBulkMarginPct(p) > 0.5 ? PALETTE.greenBg : PALETTE.accentBg, color: calcBulkMarginPct(p) > 0.5 ? PALETTE.green : PALETTE.accent, padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                            {pct(calcBulkMarginPct(p))}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Retail Products" titleTip="Pouches that cafes stock on shelves for customers to take home. RP sells at wholesale to the cafe. Retail price is what the cafe charges the end customer (informational, does not affect RP revenue)." subtitle="Pouches sold through cafe partners">
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: FONT }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                      <Th>Product</Th>
                      <Th tip="What the cafe sells the pouch for to end consumers. Does not affect RP revenue, shown for reference.">Retail Price</Th>
                      <Th tip="Price Ritual Powders charges the cafe per pouch. This is the revenue per unit to RP.">Wholesale</Th>
                      <Th tip="Cost of goods sold per pouch.">COGS</Th>
                      <Th tip="Wholesale price minus COGS per unit.">Margin</Th>
                      <Th tip="Gross margin as a percentage of wholesale price.">Margin %</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {retailProducts.map((p, i) => (
                      <tr key={p.id} style={{ borderBottom: `1px solid ${PALETTE.borderLight}` }}>
                        <td style={{ padding: "12px", fontWeight: 600 }}>{p.name}</td>
                        <td style={{ padding: "12px" }}><NumInput value={p.retailPrice} onChange={v => updateRetail(i, "retailPrice", v)} prefix="$" min={0} /></td>
                        <td style={{ padding: "12px" }}><NumInput value={p.wholesalePrice} onChange={v => updateRetail(i, "wholesalePrice", v)} prefix="$" min={0} /></td>
                        <td style={{ padding: "12px" }}><NumInput value={p.cogs} onChange={v => updateRetail(i, "cogs", v)} prefix="$" min={0} step={0.01} /></td>
                        <td style={{ padding: "12px", fontWeight: 600, color: PALETTE.green }}>{fmtFull(calcRetailMargin(p))}</td>
                        <td style={{ padding: "12px" }}>
                          <span style={{ background: PALETTE.greenBg, color: PALETTE.green, padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                            {p.wholesalePrice > 0 ? pct(calcRetailMargin(p) / p.wholesalePrice) : "0%"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* ═══════════ CAFE TIERS ═══════════ */}
        {activeSection === "tiers" && (
          <div className="fade-in" style={{ padding: "0 32px", display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
              {tiers.map((tier, i) => {
                const econ = tierEcons[i]?.econ || {};
                const bulkOpts = bulkProducts.map(p => ({
                  id: p.id, name: p.name,
                  detail: `${p.servings} servings \u00B7 ${fmtFull(p.wholesale)} wholesale \u00B7 ${pct(calcBulkMarginPct(p))} margin`
                }));
                const retailOpts = retailProducts.map(p => ({
                  id: p.id, name: p.name,
                  detail: `${fmtFull(p.wholesalePrice)} wholesale \u00B7 ${fmtFull(calcRetailMargin(p))} margin per unit`
                }));
                return (
                  <Card key={tier.id} title={tier.label} titleTip={`Defines what a typical ${tier.label.toLowerCase()} partner looks like: which products they order, daily volume, and retail units if they stock pouches. The percentage of partners who actually stock retail is set per-scenario.`} subtitle="Consumption, product selection, and per-partner economics">
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                      <div>
                        <InfoTip text="Which bulk bag products this tier of cafe orders. If multiple are selected, total daily servings are split evenly across them.">
                          <span style={{ fontSize: 11, fontWeight: 600, color: PALETTE.textMuted, letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Bulk Products</span>
                        </InfoTip>
                        <CheckboxGroup options={bulkOpts} values={tier.bulkProductIds || []} onChange={v => updateTier(i, "bulkProductIds", v)} name={`bulk-${tier.id}`} />
                      </div>

                      <div style={{ borderTop: `1px solid ${PALETTE.borderLight}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                        <SliderRow label="Drinks / Day" value={tier.drinksPerDay} onChange={v => updateTier(i, "drinksPerDay", v)} min={1} max={150} tip="Total mushroom drinks this tier makes per day across all selected bulk products. Split evenly among them." />
                        <SliderRow label="Tsp / Drink" value={tier.tspPerDrink} onChange={v => updateTier(i, "tspPerDrink", v)} min={0.5} max={3} step={0.5} tip="Teaspoons of powder per drink. 1 tsp = 1 serving. Increase if cafes use a double dose or make larger drinks." />
                        <SliderRow label="Days / Month" value={tier.daysPerMonth} onChange={v => updateTier(i, "daysPerMonth", v)} min={15} max={31} tip="Operating days per month. Most cafes are 28-30. Reduce for weekend-only or seasonal partners." />
                      </div>

                      <div style={{ borderTop: `1px solid ${PALETTE.borderLight}`, paddingTop: 14 }}>
                        <InfoTip text="Which retail pouches this tier stocks for take-home sales. If multiple are selected, total units/month are split evenly across them.">
                          <span style={{ fontSize: 11, fontWeight: 600, color: PALETTE.textMuted, letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Retail Products</span>
                        </InfoTip>
                        <CheckboxGroup options={retailOpts} values={tier.retailProductIds || []} onChange={v => updateTier(i, "retailProductIds", v)} name={`retail-${tier.id}`} />
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <SliderRow label="Retail Units / Month" value={tier.retailUnitsPerMonth} onChange={v => updateTier(i, "retailUnitsPerMonth", v)} min={0} max={100} tip="Total pouches a stocking partner sells per month across all selected retail products. Split evenly among them." />
                      </div>

                      {/* Calculated Output */}
                      <div style={{ background: PALETTE.cardAlt, borderRadius: 10, padding: 14, marginTop: 4 }}>
                        <InfoTip text="Calculated outputs based on all inputs above. Retail figures are per-partner assuming they stock retail. The scenario-level attach rate determines what fraction of partners actually do.">
                          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: PALETTE.textMuted }}>Monthly Per-Partner Output</span>
                        </InfoTip>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <InfoTip text="Drinks/day x tsp/drink x days/month. Total servings this tier consumes monthly, split across selected bulk products." inline>
                              <span style={{ fontSize: 11, color: PALETTE.textMuted }}>Total Servings:</span>
                            </InfoTip>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{econ.servingsPerMonth?.toLocaleString()}</span>
                          </div>

                          {/* Bulk product breakdown */}
                          {(econ.bulkBreakdown || []).map((b, bi) => (
                            <div key={bi} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: PALETTE.bg, borderRadius: 6, fontSize: 11 }}>
                              <span style={{ color: PALETTE.textMuted }}>{b.name}</span>
                              <span style={{ fontWeight: 600 }}>{b.bags} bags \u00B7 {fmtFull(b.rev)}</span>
                            </div>
                          ))}

                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <div>
                              <InfoTip text="Total wholesale revenue from all bulk bag orders combined." inline>
                                <span style={{ fontSize: 11, color: PALETTE.textMuted }}>Bulk Rev:</span>
                              </InfoTip>
                              <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 4 }}>{fmtFull(econ.bulkRev)}</span>
                            </div>
                            <div>
                              <InfoTip text="Total retail wholesale revenue across all selected pouches (if partner stocks retail)." inline>
                                <span style={{ fontSize: 11, color: PALETTE.textMuted }}>Retail Rev:</span>
                              </InfoTip>
                              <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 4 }}>{fmtFull(econ.retailRev)}</span>
                            </div>
                          </div>

                          <div style={{ borderTop: `1px solid ${PALETTE.border}`, paddingTop: 8, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                            <InfoTip text="Bulk + retail revenue if this partner stocks retail. In projections, the scenario attach rate determines how many partners actually do." inline>
                              <span style={{ fontSize: 12, fontWeight: 600 }}>Total (if stocking): {fmtFull(econ.totalRev)}</span>
                            </InfoTip>
                            <InfoTip text="Gross profit per partner if stocking retail." inline>
                              <span style={{ fontSize: 12, fontWeight: 600, color: PALETTE.green }}>Profit: {fmtFull(econ.totalProfit)}</span>
                            </InfoTip>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══════════ SCENARIOS ═══════════ */}
        {activeSection === "scenarios" && (
          <div className="fade-in" style={{ padding: "0 32px", display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: 13, color: PALETTE.textMuted, margin: 0 }}>
                Configure growth assumptions per scenario. Adjust partner acquisition, churn, and tier mix to compare outcomes.
              </p>
              {scenarios.length < 5 && (
                <button onClick={addScenario} style={{
                  background: PALETTE.text, color: PALETTE.bg, border: "none", borderRadius: 10,
                  padding: "10px 20px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap",
                }}>+ Add Scenario</button>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
              {scenarios.map((s, i) => (
                <div key={i} style={{ background: PALETTE.card, border: `2px solid ${s.color}22`, borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 14, height: 14, borderRadius: "50%", background: s.color }} />
                      <input value={s.name} onChange={e => updateScenario(i, "name", e.target.value)}
                        style={{ background: "none", border: "none", borderBottom: `1px solid ${PALETTE.border}`, color: PALETTE.text, fontSize: 15, fontWeight: 600, fontFamily: FONT, padding: "2px 0", outline: "none", width: 150 }} />
                    </div>
                    {scenarios.length > 1 && (
                      <button onClick={() => removeScenario(i)} style={{ background: "none", border: `1px solid ${PALETTE.border}`, borderRadius: 6, color: PALETTE.textMuted, cursor: "pointer", padding: "3px 10px", fontSize: 11, fontFamily: FONT }}>Remove</button>
                    )}
                  </div>

                  <SliderRow label="Starting Partners" value={s.startingPartners} onChange={v => updateScenario(i, "startingPartners", v)} min={0} max={30} tip="How many active cafe partners you begin Month 1 with. Set to your current real partner count." />
                  <SliderRow label="New Partners / Month" value={s.newPartnersPerMonth} onChange={v => updateScenario(i, "newPartnersPerMonth", v)} min={0} max={15} tip="Net new cafe partners signed each month. Assumed constant across all 12 months." />
                  <SliderRow label="% Small" value={s.pctSmall} onChange={v => updateScenario(i, "pctSmall", v)} min={0} max={100} suffix="%" tip="Percentage of all partners that are Small tier cafes. Small + Medium + Large should total 100%." />
                  <SliderRow label="% Medium" value={s.pctMedium} onChange={v => updateScenario(i, "pctMedium", v)} min={0} max={100} suffix="%" tip="Percentage of all partners that are Medium tier cafes." />
                  <SliderRow label="% Large" value={s.pctLarge} onChange={v => updateScenario(i, "pctLarge", v)} min={0} max={100} suffix="%" tip="Percentage of all partners that are Large tier cafes." />
                  {Math.abs(s.pctSmall + s.pctMedium + s.pctLarge - 100) > 1 && (
                    <div style={{ fontSize: 11, color: PALETTE.accent, background: PALETTE.accentBg, padding: "6px 10px", borderRadius: 8 }}>
                      \u26A0 Tier mix = {s.pctSmall + s.pctMedium + s.pctLarge}% (should be 100%)
                    </div>
                  )}
                  <SliderRow label="Monthly Churn" value={s.monthlyChurnPct} onChange={v => updateScenario(i, "monthlyChurnPct", v)} min={0} max={20} step={0.5} suffix="%" tip="Percentage of active partners lost each month. Applied before new partners are added. 2% means losing roughly 1 in 50 partners per month." />
                  <SliderRow label="% Partners Stocking Retail" value={s.retailAttachPct} onChange={v => updateScenario(i, "retailAttachPct", v)} min={0} max={100} suffix="%" tip="Percentage of bulk cafe partners who also stock retail pouches for take-home sales. Applied across all tiers. At 50%, half your partners generate retail revenue and half are bulk-only." />

                  <div style={{ background: PALETTE.cardAlt, borderRadius: 10, padding: 14, marginTop: 4, borderLeft: `3px solid ${s.color}` }}>
                    {(() => {
                      const d = allProjections[i]?.data[11];
                      const yr = allProjections[i]?.data.reduce((sum, m) => sum + m.totalRevenue, 0) || 0;
                      return d ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 12 }}>
                          <div>
                            <InfoTip text="This scenario's projected monthly revenue at month 12." inline>
                              <span style={{ color: PALETTE.textMuted }}>M12 Rev:</span>
                            </InfoTip>
                            <span style={{ fontWeight: 600, marginLeft: 4 }}>{fmtFull(d.totalRevenue)}</span>
                          </div>
                          <div>
                            <InfoTip text="This scenario's projected monthly gross profit at month 12." inline>
                              <span style={{ color: PALETTE.textMuted }}>M12 Profit:</span>
                            </InfoTip>
                            <span style={{ fontWeight: 600, color: PALETTE.green, marginLeft: 4 }}>{fmtFull(d.totalProfit)}</span>
                          </div>
                          <div>
                            <InfoTip text="Total active partners at month 12 after churn." inline>
                              <span style={{ color: PALETTE.textMuted }}>Partners:</span>
                            </InfoTip>
                            <span style={{ fontWeight: 600, marginLeft: 4 }}>{Math.round(d.totalActive)}</span>
                          </div>
                          <div>
                            <InfoTip text="Cumulative revenue across all 12 months." inline>
                              <span style={{ color: PALETTE.textMuted }}>Year 1:</span>
                            </InfoTip>
                            <span style={{ fontWeight: 600, marginLeft: 4 }}>{fmt(yr)}</span>
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
