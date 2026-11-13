// dsh-usage-ledger browser half.
//
// Executing this file only registers a lazy factory; the module body (styles,
// locale, slot registration) runs when the browser materializes the module.
//
// Two contributions: a `sidebar.panellist` cell for the global panel icon, and
// the `main` panel keyed by that cell's id. Everything the page shows comes from
// the host route — the browser never folds session events itself.
//
// States (exclusive): active · archived · deleted. "Current" = active + archived.
// Subagent sessions are folded into the top-level session that started them.
// UI reference: Context Insights from dsh-context by bowenliang123:
// https://github.com/bowenliang123/dsh-context
// This project extends that reference with a durable usage ledger, retained
// usage after deletion, session management, and its own navigation/drilldowns.

window.__ModuleLoader__.load({
  id: "dsh-usage-ledger",
  factory: (require) => {
    var React = require("react");
    var h = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useMemo = React.useMemo;
    var useRef = React.useRef;

    var NS = "dsh-usage-ledger";
    var BASE = "/api/usage-ledger";
    var HEADER = "x-dsh-usage-ledger";
    var STYLE_ID = "dsh-usage-ledger-style";
    var REFERENCE_URL = "https://github.com/bowenliang123/dsh-context";

    // Categorical data-viz palette. Chart colours are artwork, not chrome: the
    // theme brand accent collapses to a near-neutral in this theme, and a chart
    // whose every series is the same grey conveys nothing. Text, borders and
    // surfaces stay on theme tokens.
    var PALETTE = ["#4d8df6", "#2fbf71", "#f0a132", "#a97bf0", "#e5645f", "#39c0c8", "#d4b83a", "#8a94a6"];

    var CSS = [
      ".dul_page{box-sizing:border-box;width:100%;height:100%;overflow:auto;padding:16px 22px 32px;color:var(--dsw-alias-label-primary);font-size:12.5px;line-height:18px}",
      ".dul_inner{display:flex;flex-direction:column;gap:10px;max-width:1120px;margin:0 auto;width:100%;container-type:inline-size}",

      ".dul_head{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:0}",
      ".dul_titles{flex:1;min-width:220px;display:flex;flex-direction:column;gap:1px}",
      ".dul_title{margin:0;font-size:17px;line-height:24px;font-weight:600;letter-spacing:-.01em}",
      ".dul_subtitle{margin:0;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}",
      ".dul_tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",

      ".dul_seg{display:inline-flex;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}",
      ".dul_segBtn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;line-height:17px;padding:4px 9px;cursor:pointer}",
      ".dul_segBtn+.dul_segBtn{border-left:1px solid var(--dsw-alias-border-l2)}",
      ".dul_segBtn:hover{color:var(--dsw-alias-label-primary)}",
      ".dul_segBtnOn{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600}",
      ".dul_btn{display:inline-flex;align-items:center;justify-content:center;min-height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;line-height:17px;cursor:pointer;white-space:nowrap}",
      ".dul_btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}",
      ".dul_btn:disabled{cursor:not-allowed;opacity:.55}",
      ".dul_pill{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:3px 10px;font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-secondary);white-space:nowrap}",
      ".dul_btnPrimary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}",
      ".dul_btnPrimary:hover:not(:disabled){background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}",
      ".dul_btnDanger{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}",
      ".dul_btnDanger:hover:not(:disabled){background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-bg-base)}",
      ".dul_overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.48);z-index:1200}",
      ".dul_dialog{width:340px;max-width:calc(100vw - 40px);box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-overlay);box-shadow:0 16px 40px rgba(0,0,0,.35);padding:16px;display:flex;flex-direction:column;gap:8px}",
      ".dul_dialogTitle{margin:0;font-size:14px;line-height:20px;font-weight:600}",
      ".dul_dialogText{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}",
      ".dul_dialogActions{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}",

      ".dul_card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:10px 12px;display:flex;flex-direction:column;gap:8px;min-width:0}",
      ".dul_cardHead{display:flex;align-items:baseline;gap:8px;justify-content:space-between}",
      ".dul_cardTitle{font-size:12px;line-height:18px;font-weight:600}",
      ".dul_cardHint{color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:15px}",

      ".dul_top{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) minmax(330px,1.5fr);gap:8px;align-items:stretch}",
      ".dul_chartCard{grid-column:4;grid-row:1 / span 2;justify-content:flex-start}",
      ".dul_chartCard .dul_plot,.dul_chartCard .dul_yaxisCol{height:104px}",
      ".dul_chartCard .dul_yaxisCol{min-width:46px;font-size:8px;line-height:10px}",
      ".dul_kpi{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:9px 10px;display:flex;flex-direction:column;align-items:center;gap:1px;text-align:center}",
      ".dul_kpiLabel{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}",
      ".dul_kpiValue{font-size:20px;line-height:26px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}",
      ".dul_kpiHint{color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:15px}",

      ".dul_chartSummary{display:flex;align-items:baseline;gap:18px;flex-wrap:wrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}",
      ".dul_chartSummary b{color:var(--dsw-alias-label-primary);font-weight:600;font-variant-numeric:tabular-nums}",
      ".dul_plotRow{display:flex;gap:8px;align-items:stretch}",
      ".dul_yaxisCol{display:flex;flex-direction:column;justify-content:space-between;min-width:46px;height:152px;padding:2px 0;box-sizing:border-box;text-align:right;font-size:10px;line-height:12px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}",
      ".dul_plot{position:relative;flex:1;min-width:0;height:152px}",
      ".dul_gridline{position:absolute;left:0;right:0;border-top:1px dashed var(--dsw-alias-border-l1);opacity:.55}",
      ".dul_chart{position:absolute;inset:0;display:flex;align-items:flex-end;gap:6px}",
      ".dul_dayGroup{position:relative;flex:1;min-width:6px;height:100%;display:flex;align-items:flex-end}",
      ".dul_dayGroupOn .dul_bar{opacity:1}",
      ".dul_dayValue{position:absolute;left:0;right:0;display:flex;flex-direction:column;align-items:center;font-size:9px;line-height:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;pointer-events:none;z-index:3}",
      ".dul_dayBars{width:100%;height:100%;display:flex;align-items:flex-end;gap:2px}",
      ".dul_bar{flex:1;min-width:1px;border-radius:3px 3px 1px 1px;min-height:2px;opacity:.82;transition:opacity .12s}",
      ".dul_barEmpty{flex:1;min-width:1px;height:2px;border-radius:1px;background:var(--dsw-alias-border-l1)}",
      ".dul_dayTip{position:absolute;top:-2px;transform:translate(-50%,-100%);background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.35);padding:7px 9px;font-size:11px;line-height:16px;white-space:nowrap;pointer-events:none;z-index:6}",
      ".dul_dayTipDate{font-weight:600;margin-bottom:2px}",
      ".dul_yaxisRight{text-align:left;padding-left:6px}",
      ".dul_axis{display:flex;justify-content:space-between;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;margin-top:2px}",
      ".dul_chartLegend{display:flex;align-items:center;gap:16px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}",
      ".dul_chartLegend span{display:inline-flex;align-items:center;gap:6px}",

      ".dul_grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:8px}",
      ".dul_layout{display:grid;grid-template-columns:276px minmax(0,1fr);gap:8px;align-items:start}",
      ".dul_rail{display:flex;flex-direction:column;gap:8px;min-width:0}",
      ".dul_donutRow{display:flex;align-items:center;gap:12px;flex-wrap:wrap}",
      ".dul_donut{flex:0 0 auto;position:relative}",
      ".dul_donutCenter{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;pointer-events:none}",
      ".dul_donutValue{font-size:13px;line-height:17px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}",
      ".dul_donutLabel{font-size:9px;line-height:13px;color:var(--dsw-alias-label-secondary);white-space:nowrap}",
      ".dul_legend{flex:1;min-width:150px;display:flex;flex-direction:column;gap:4px}",
      ".dul_legendRow{display:flex;align-items:center;gap:7px;font-size:11.5px;line-height:17px}",
      ".dul_dot{width:8px;height:8px;border-radius:2px;flex:0 0 auto}",
      ".dul_legendName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}",
      ".dul_legendValue{font-variant-numeric:tabular-nums;white-space:nowrap}",
      ".dul_legendPct{width:46px;text-align:right;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}",
      ".dul_clegend{flex:1;min-width:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 18px}",
      ".dul_clegendItem{display:flex;flex-direction:column;min-width:0;border-radius:6px;padding:2px 4px;margin:-2px -4px;cursor:default}",
      ".dul_clegendItem:hover{background:var(--dsw-alias-bg-layer-2)}",
      ".dul_clegendItemOn{background:var(--dsw-alias-bg-layer-2)}",
      ".dul_clegendLine{display:flex;align-items:baseline;justify-content:space-between;gap:8px}",
      ".dul_clegendName{font-size:11.5px;line-height:16px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dul_clegendPct{font-size:11.5px;line-height:16px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}",
      ".dul_clegendValue{font-size:10.5px;line-height:15px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}",

      ".dul_heat{display:flex;flex-direction:column;gap:3px}",
      ".dul_heatRow{display:grid;grid-template-columns:20px repeat(8,20px);gap:4px;align-items:center;justify-content:center}",
      ".dul_heatRowHead{margin-bottom:1px}",
      ".dul_heatDow{font-size:10px;line-height:12px;color:var(--dsw-alias-label-secondary);text-align:right;padding-right:4px}",
      ".dul_heatMonth{font-size:10px;line-height:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden}",
      ".dul_cell{width:100%;aspect-ratio:1 / 1;border-radius:3px;background:var(--dsw-alias-bg-layer-2)}",
      ".dul_cellEmpty{background:transparent}",
      ".dul_heatAxis{display:flex;justify-content:space-between;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;margin-top:2px}",
      ".dul_heatLegend{display:flex;align-items:center;gap:4px;justify-content:flex-end;font-size:10px;line-height:14px;color:var(--dsw-alias-label-secondary)}",
      ".dul_swatch{width:10px;height:10px;border-radius:2px}",
      ".dul_skillList{display:flex;flex-direction:column;gap:6px}",
      ".dul_skillRow{display:flex;align-items:center;gap:7px;font-size:11.5px;line-height:17px}",
      ".dul_skillDot{width:6px;height:6px;border-radius:50%;flex:0 0 auto}",
      ".dul_skillName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dul_skillCount{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}",
      ".dul_skillWhen{color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap;min-width:56px;text-align:right}",

      ".dul_cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px}",
      ".dul_scard{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:9px 11px;display:flex;flex-direction:column;gap:6px;min-width:0}",
      ".dul_scardClickable{cursor:pointer}",
      ".dul_scardClickable:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}",
      ".dul_scardHead{display:flex;align-items:flex-start;gap:8px;justify-content:space-between}",
      ".dul_scardTitle{margin:0;font-size:12px;line-height:17px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dul_scardMeta{display:flex;align-items:center;gap:6px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);min-width:0}",
      ".dul_scardMetaText{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dul_scardBody{display:flex;align-items:center;gap:14px}",
      ".dul_scardStats{flex:1;min-width:0;display:grid;grid-template-columns:auto auto;gap:3px 10px;font-size:12px;line-height:18px;justify-content:space-between}",
      ".dul_scardStatLabel{color:var(--dsw-alias-label-secondary)}",
      ".dul_scardStatValue{text-align:right;font-variant-numeric:tabular-nums}",
      ".dul_scardFoot{display:flex;align-items:center;gap:8px;justify-content:flex-end;min-height:24px}",
      ".dul_scardBody .dul_donutValue{font-size:11px;line-height:14px}",
      ".dul_scardBody .dul_donutLabel{display:none}",
      ".dul_sbtn{display:inline-flex;align-items:center;justify-content:center;min-height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap}",
      ".dul_sbtn:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}",
      ".dul_sbtnDanger{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}",
      ".dul_sbtnDanger:hover:not(:disabled){background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-bg-base)}",
      ".dul_sbtn:disabled{cursor:not-allowed;opacity:.55}",
      ".dul_filters{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".dul_scardAgg{background:transparent;border-style:dashed}",
      ".dul_forgotten{margin-top:8px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:17px}",
      ".dul_search{flex:1;min-width:160px;height:28px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;padding:0 9px}",

      ".dul_table{width:100%;border-collapse:collapse;font-size:12px;line-height:18px}",
      ".dul_table th{text-align:left;font-weight:500;color:var(--dsw-alias-label-secondary);padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);white-space:nowrap}",
      ".dul_table td{padding:10px;border-bottom:1px solid var(--dsw-alias-border-l1);vertical-align:middle}",
      ".dul_table tr:last-child td{border-bottom:0}",
      ".dul_table tbody tr:hover{background:var(--dsw-alias-bg-layer-2)}",
      ".dul_num{font-variant-numeric:tabular-nums;white-space:nowrap}",
      ".dul_strong{font-weight:600}",
      ".dul_name{display:flex;flex-direction:column;gap:2px;min-width:0}",
      ".dul_nameText{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:340px}",
      ".dul_path{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:340px;display:flex;align-items:center;gap:6px}",
      ".dul_chip{display:inline-flex;align-items:center;border-radius:6px;padding:0 6px;font-size:11px;line-height:16px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);white-space:nowrap}",
      ".dul_badge{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:1px 8px;font-size:11px;line-height:16px;border:1px solid transparent;white-space:nowrap}",
      ".dul_badgeActive{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}",
      ".dul_badgeArchived{color:var(--dsw-alias-label-secondary);border-color:var(--dsw-alias-border-l2)}",
      ".dul_badgeDeleted{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}",
      ".dul_cellActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".dul_link{appearance:none;border:0;background:transparent;padding:0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:16px;cursor:pointer;text-decoration:underline}",
      ".dul_link:hover{color:var(--dsw-alias-label-primary)}",
      ".dul_linkDanger{color:var(--dsw-alias-state-error-primary)}",
      ".dul_muted{color:var(--dsw-alias-label-secondary)}",
      ".dul_empty{color:var(--dsw-alias-label-secondary);text-align:center;padding:26px 0;font-size:12px}",
      ".dul_error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;margin:0}",

      "@media (max-width:1100px){.dul_top{grid-template-columns:repeat(2,minmax(0,1fr))}.dul_chartCard{grid-column:1 / -1;grid-row:auto}.dul_layout{grid-template-columns:minmax(0,1fr)}}",
      "@media (max-width:900px){.dul_grid2{grid-template-columns:minmax(0,1fr)}}",
      "@container (max-width: 1000px){.dul_top{grid-template-columns:repeat(2,minmax(0,1fr))}.dul_chartCard{grid-column:1 / -1;grid-row:auto}.dul_layout{grid-template-columns:minmax(0,1fr)}}",
      "@container (max-width: 720px){.dul_grid2{grid-template-columns:minmax(0,1fr)}}",
      "@container (max-width: 560px){.dul_top{grid-template-columns:minmax(0,1fr)}}",
      ".dul_dense .dul_inner{gap:8px}",
      ".dul_dense .dul_card{padding:8px 10px;gap:6px}",
      ".dul_dense .dul_kpi{padding:7px 8px}",
      ".dul_dense .dul_kpiValue{font-size:18px;line-height:24px}",
      ".dul_dense .dul_kpiLabel{font-size:10.5px;line-height:15px}",
      ".dul_dense .dul_scard{padding:8px 10px;gap:5px}",
      ".dul_dense .dul_cards{grid-template-columns:repeat(auto-fill,minmax(215px,1fr))}",
      ".dul_dense .dul_scardBody{gap:10px}",
      ".dul_dense .dul_heatRow{grid-template-columns:18px repeat(8,18px);gap:3px}",
      ".dul_page{padding:12px 16px 24px}.dul_inner{max-width:1440px;gap:8px}.dul_titles{min-width:130px}.dul_head{align-items:center}.dul_tools{gap:6px}.dul_btn,.dul_segBtn{min-height:28px}.dul_kpiHint{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}",
      ".dul_top{grid-template-columns:repeat(6,minmax(0,1fr));gap:0;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}.dul_kpi{border:0;border-radius:0;background:transparent;align-items:flex-start;text-align:left;border-right:1px solid var(--dsw-alias-border-l1);padding:8px 12px}.dul_kpi:last-child{border-right:0}.dul_dense .dul_kpi{padding:8px 11px}",
      ".dul_analysis{display:grid;grid-template-columns:minmax(0,1.2fr) repeat(2,minmax(0,1fr));gap:8px;align-items:stretch}.dul_analysis .dul_card{padding:9px 11px;gap:6px}.dul_analysis>.dul_chartCard{grid-column:1;grid-row:1 / span 2}.dul_analysis .dul_plot,.dul_analysis .dul_yaxisCol{height:92px;font-size:11px;line-height:12px}.dul_analysis .dul_dayValue{display:none}.dul_analysis .dul_donutRow{gap:9px;flex-wrap:nowrap;flex:1}.dul_analysis .dul_clegend{grid-template-columns:minmax(0,1fr);gap:1px}.dul_analysis .dul_clegendItem{padding:0 3px;margin:0 -3px}.dul_analysis .dul_clegendName,.dul_analysis .dul_clegendPct{font-size:11px;line-height:17px}.dul_analysis .dul_clegendValue{display:none}.dul_analysis .dul_cardHint{font-size:11px}.dul_analysis .dul_chartLegend{gap:12px;flex-wrap:wrap}.dul_analysis>.dul_chartCard .dul_plotRow{flex:1;min-height:92px}.dul_analysis>.dul_chartCard .dul_plot,.dul_analysis>.dul_chartCard .dul_yaxisCol{height:auto;min-height:92px}.dul_analysis>.dul_heatCard{grid-column:2;grid-row:2}.dul_analysis>.dul_skillCard{grid-column:3;grid-row:2}.dul_analysis .dul_heat{gap:2px}.dul_analysis .dul_heatRow{grid-template-columns:18px repeat(8,14px);gap:2px}.dul_analysis .dul_heatMonth{overflow:visible}.dul_analysis .dul_heatLegend{margin-top:auto}.dul_analysis .dul_skillList{gap:1px}.dul_analysis .dul_skillRow{padding:2px 0;gap:5px}.dul_analysis .dul_skillWhen{min-width:44px}",
      "button.dul_dayGroup{appearance:none;padding:0;border:0;background:transparent;color:inherit;cursor:pointer}button.dul_cell{appearance:none;padding:0;border:0;cursor:pointer}button.dul_skillRow{appearance:none;width:100%;border:0;background:transparent;color:inherit;text-align:left;font:inherit;padding:4px;border-radius:5px;cursor:pointer}button.dul_skillRow:hover{background:var(--dsw-alias-bg-layer-2)}button.dul_clegendItem{appearance:none;width:100%;border:0;background:transparent;text-align:left;color:inherit;font:inherit;cursor:pointer}button.dul_clegendItem:hover{background:var(--dsw-alias-bg-layer-2)}.dul_donut circle[data-selectable]{cursor:pointer}.dul_dayGroup:focus-visible{outline-offset:3px}",
      ".dul_sessions{padding:0;gap:0}.dul_sessionsHead{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 11px 0}.dul_sessionsTitle{margin:0;font-size:13px;line-height:20px;font-weight:600}.dul_sessionTools{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.dul_sessions .dul_filters{padding:8px 11px;gap:6px}.dul_search{height:28px;min-width:150px}.dul_select{max-width:100%;height:28px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;padding:0 6px}.dul_tableWrap{overflow-x:auto}.dul_table{table-layout:fixed;min-width:640px}.dul_table th{padding:6px 10px;background:var(--dsw-alias-bg-layer-1)}.dul_table td{padding:7px 10px}.dul_table th:first-child{width:38%}.dul_table th:last-child{width:68px}.dul_table .dul_num{text-align:right}.dul_table .dul_nameText,.dul_table .dul_path{max-width:none}.dul_sessionOpen{appearance:none;display:block;max-width:100%;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-weight:600;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}.dul_sessionOpen:hover{text-decoration:underline}.dul_sessionMeta{display:flex;gap:6px;align-items:center;min-width:0;font-size:11px;color:var(--dsw-alias-label-secondary)}.dul_sessionMeta>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dul_actionSelect{width:68px;padding:0 3px}.dul_sessions .dul_cards{padding:0 11px 10px}.dul_sessions .dul_forgotten{margin:0;padding:8px 11px}.dul_resultStatus{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:7px 11px;font-size:11px;color:var(--dsw-alias-label-secondary)}.dul_notice{margin:0;padding:6px 11px;font-size:12px}.dul_noticeError{color:var(--dsw-alias-state-error-primary)}.dul_noticeSuccess{color:var(--dsw-alias-state-success-primary)}.dul_pager{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.dul_refreshError{padding:8px 10px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:7px}",
      ".dul_overviewContent{display:flex;flex-direction:column;gap:8px;min-width:0}.dul_overviewContent[hidden]{display:none}.dul_detailPanel{min-width:0;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px}.dul_detailHead{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}.dul_detailBack{display:inline-flex;align-items:center;gap:5px;flex:0 0 auto}.dul_detailCrumb{display:flex;align-items:center;gap:9px;min-width:0;color:var(--dsw-alias-label-secondary)}.dul_detailCrumb h2{margin:0;font-size:13px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}.dul_detailBody{padding:14px}.dul_detailStats{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base)}.dul_detailStat{display:flex;flex-direction:column;gap:3px}.dul_detailStatLabel{font-size:11px;color:var(--dsw-alias-label-secondary)}.dul_detailValue{font-size:24px;line-height:30px;font-weight:600;font-variant-numeric:tabular-nums}.dul_detailSecondary{font-size:16px;line-height:24px;font-weight:600;font-variant-numeric:tabular-nums}.dul_detailHint{color:var(--dsw-alias-label-secondary);font-size:11px;margin:8px 0 14px}.dul_detailListHead{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:6px;color:var(--dsw-alias-label-secondary);font-size:11px;border-bottom:1px solid var(--dsw-alias-border-l1)}.dul_detailRow{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:18px;padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}.dul_detailRow:last-child{border-bottom:0}.dul_detailMetric{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.dul_detailName{min-width:0}.dul_detailTitle{display:flex;align-items:center;gap:8px;min-width:0}.dul_detailTitle>.dul_badge{flex:0 0 auto;font-size:10px;line-height:16px;padding:0 5px}.dul_detailSessionName{display:block;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;font-weight:600}.dul_detailList{margin:0;padding:0;list-style:none}.dul_detailRow .dul_sessionMeta{margin-top:3px}.dul_dialog{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1)}.dul_dialog .dul_error{margin:3px 0}.dul_listHint{font-size:11px;color:var(--dsw-alias-label-secondary)}@container(max-width:540px){.dul_detailBody{padding:10px}.dul_detailHead{padding:9px 10px;gap:8px}.dul_detailTitle{flex-wrap:wrap;gap:3px 6px}.dul_detailRow{gap:10px}.dul_detailValue{font-size:21px;line-height:28px}}",
      "@container (max-width:820px){.dul_top{grid-template-columns:repeat(3,minmax(0,1fr))}.dul_kpi:nth-child(3){border-right:0}.dul_kpi:nth-child(-n+3){border-bottom:1px solid var(--dsw-alias-border-l1)}}@container (max-width:820px){.dul_analysis{grid-template-columns:repeat(2,minmax(0,1fr))}.dul_analysis>.dul_chartCard{grid-column:1/-1;grid-row:auto}.dul_analysis>.dul_heatCard,.dul_analysis>.dul_skillCard{grid-column:auto;grid-row:auto}.dul_analysis>.dul_chartCard .dul_plotRow{flex:0 0 104px}.dul_analysis>.dul_chartCard .dul_plot,.dul_analysis>.dul_chartCard .dul_yaxisCol{height:104px;min-height:104px}.dul_analysis .dul_plot,.dul_analysis .dul_yaxisCol{height:72px}.dul_top{grid-template-columns:repeat(3,minmax(0,1fr))}.dul_table th:first-child{width:32%}}@container (max-width:540px){.dul_analysis{grid-template-columns:minmax(0,1fr)}.dul_analysis>.dul_chartCard{grid-column:auto}.dul_top{grid-template-columns:repeat(2,minmax(0,1fr))}.dul_kpi:nth-child(3){border-right:1px solid var(--dsw-alias-border-l1)}.dul_kpi:nth-child(even){border-right:0}.dul_kpi:nth-child(-n+4){border-bottom:1px solid var(--dsw-alias-border-l1)}.dul_head{align-items:flex-start}.dul_tools{width:100%}.dul_search{flex-basis:100%}.dul_sessionTools{width:100%;justify-content:space-between}}@media(pointer:coarse){.dul_btn,.dul_segBtn,.dul_select{min-height:36px}.dul_search{height:36px;font-size:16px}.dul_analysis .dul_heatRow{grid-template-columns:18px repeat(8,24px);gap:4px}.dul_skillRow{min-height:36px}}@media(prefers-reduced-motion:reduce){.dul_bar{transition:none}}",
      ".dul_navigation{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:0 0 5px;background:var(--dsw-alias-bg-base);border-bottom:1px solid var(--dsw-alias-border-l1)}.dul_tabs{display:flex;align-items:center;gap:4px}.dul_tab{appearance:none;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;padding:6px 12px;cursor:pointer}.dul_tab[aria-selected=true]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600}.dul_tab:hover{color:var(--dsw-alias-label-primary)}.dul_panel{display:flex;flex-direction:column;gap:8px;min-width:0}.dul_panel[hidden]{display:none}.dul_reference{font-size:11.5px;line-height:18px;color:var(--dsw-alias-label-secondary);text-underline-offset:3px;white-space:nowrap}.dul_reference:hover{color:var(--dsw-alias-label-primary)}.dul_resultStatus{flex-wrap:wrap;gap:8px}.dul_pager .dul_select{height:26px;min-width:65px}.dul_pageNumber{display:inline-flex;align-items:center;gap:5px;font-variant-numeric:tabular-nums}.dul_pageNumber .dul_select{min-width:47px}.dul_pageResults{font-variant-numeric:tabular-nums}@media(pointer:coarse){.dul_tab{min-height:38px}.dul_pager .dul_select{min-height:36px}}",
    ].join("");

    function injectStyle() {
      if (typeof document === "undefined") return null;
      var tag = document.createElement("style");
      tag.dataset.plugin = "dsh-usage-ledger";
      tag.dataset.pluginCss = STYLE_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
      return tag;
    }

    function request(path, options) {
      var init = {
        method: options && options.method ? options.method : "GET",
        credentials: "same-origin",
        headers: { [HEADER]: "1" },
      };
      if (options && options.body !== undefined) {
        init.headers["content-type"] = "application/json";
        init.body = JSON.stringify(options.body);
      }
      return fetch(path, init).then(function (response) {
        return response
          .json()
          .catch(function () {
            return { ok: false, error: "internal" };
          })
          .then(function (payload) {
            if (!response.ok || payload.ok === false) {
              var error = new Error(payload.error || "internal");
              error.code = payload.error || "internal";
              throw error;
            }
            return payload;
          });
      });
    }

    // ---------------------------------------------------------------------
    // Formatting
    // ---------------------------------------------------------------------

    /** Metric units everywhere, so cards and charts never mix 亿 with M. */
    function formatTokens(value, t) {
      var n = typeof value === "number" && isFinite(value) ? value : 0;
      if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
      if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
      if (n >= 1e3) return Math.round(n / 1e3) + "k";
      return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    /** Compact metric form (147.1M) for chart axes and bar labels. */
    function formatMetric(value) {
      var n = typeof value === "number" && isFinite(value) ? value : 0;
      if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
      if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
      if (n >= 1e3) return Math.round(n / 1e3) + "k";
      return String(Math.round(n));
    }


    function formatPercent(value) {
      return (value * 100).toFixed(1) + "%";
    }

    function formatShare(value, total) {
      if (total <= 0) return "0%";
      var share = (value / total) * 100;
      return (share >= 10 ? share.toFixed(0) : share.toFixed(1)) + "%";
    }

    function dayKeyOf(date) {
      var year = date.getFullYear();
      var month = String(date.getMonth() + 1).padStart(2, "0");
      var day = String(date.getDate()).padStart(2, "0");
      return year + "-" + month + "-" + day;
    }

    function dayKeysBack(count) {
      var keys = [];
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      for (var index = count - 1; index >= 0; index -= 1) keys.push(dayKeyOf(new Date(today.getTime() - index * 86400000)));
      return keys;
    }

    /** Human duration in the active locale's units. */
    function formatDuration(ms, t) {
      var total = Math.max(0, Math.round((typeof ms === "number" && isFinite(ms) ? ms : 0) / 1000));
      var hours = Math.floor(total / 3600);
      var minutes = Math.floor((total % 3600) / 60);
      var seconds = total % 60;
      if (hours > 0) return t("dur.hm", { h: hours, m: minutes });
      if (minutes > 0) return t("dur.ms", { m: minutes, s: seconds });
      return t("dur.s", { s: seconds });
    }

    /** The ring has room for one short number, with its unit on a second line. */
    function durationCenter(ms, t) {
      var seconds = Math.max(0, Math.round((typeof ms === "number" && isFinite(ms) ? ms : 0) / 1000));
      var unit = seconds >= 3600 ? "h" : seconds >= 60 ? "m" : "s";
      var value = seconds / (unit === "h" ? 3600 : unit === "m" ? 60 : 1);
      return { value: value >= 1000 ? formatMetric(value) : value.toFixed(value >= 100 ? 0 : 1).replace(/\.0$/, ""), unit: t("dur.unit." + unit) };
    }

    function formatWhen(ms, t) {
      if (typeof ms !== "number" || ms <= 0) return "—";
      var minutes = Math.round((Date.now() - ms) / 60000);
      if (minutes < 1) return t("time.now");
      if (minutes < 60) return t("time.minutes", { n: minutes });
      if (minutes < 60 * 24) return t("time.hours", { n: Math.round(minutes / 60) });
      if (minutes < 60 * 24 * 30) return t("time.days", { n: Math.round(minutes / (60 * 24)) });
      return dayKeyOf(new Date(ms));
    }

    function sumDays(session, cutoffKey) {
      var totals = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, tokens: 0, requests: 0, cost: 0 };
      var days = session.days || {};
      for (var key in days) {
        if (!Object.prototype.hasOwnProperty.call(days, key)) continue;
        if (cutoffKey !== null && key < cutoffKey) continue;
        var day = days[key] || {};
        totals.input += day.input || 0;
        totals.cacheRead += day.cacheRead || 0;
        totals.cacheWrite += day.cacheWrite || 0;
        totals.output += day.output || 0;
        totals.tokens += day.tokens || 0;
        totals.requests += day.requests || 0;
        totals.cost += day.cost || 0;
      }
      return totals;
    }

    function sessionInRange(session, range) {
      if (range === "all") {
        var totals = session.totals || {};
        return {
          input: totals.input || 0,
          cacheRead: totals.cacheRead || 0,
          cacheWrite: totals.cacheWrite || 0,
          output: totals.output || 0,
          tokens: (totals.input || 0) + (totals.cacheRead || 0) + (totals.cacheWrite || 0) + (totals.output || 0),
          requests: session.steps || 0,
          cost: session.cost || 0,
        };
      }
      return sumDays(session, dayKeysBack(range === "7d" ? 7 : 30)[0]);
    }

    function cacheHitOf(totals) {
      var denominator = (totals.input || 0) + (totals.cacheRead || 0);
      if (denominator <= 0) return 0;
      return (totals.cacheRead || 0) / denominator;
    }

    function emptyAggregate() {
      return { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, tokens: 0, sessions: 0, turns: 0, cost: 0 };
    }

    function addAggregate(target, totals, turns) {
      target.input += totals.input;
      target.cacheRead += totals.cacheRead;
      target.cacheWrite += totals.cacheWrite;
      target.output += totals.output;
      target.tokens += totals.tokens;
      target.sessions += 1;
      target.turns += turns || 0;
      target.cost += totals.cost || 0;
    }

    /** Estimated spend, shown in CNY for zh and USD for en. */
    function formatCost(usd, rate, t) {
      var value = typeof usd === "number" && isFinite(usd) ? usd : 0;
      if (value <= 0) return "—";
      var system = typeof t === "function" ? t("number.system") : "zh";
      if (system === "en") return "$" + value.toFixed(2);
      return "¥" + (value * (rate || 7.2)).toFixed(2);
    }

    /** Strip the id namespaces so a ledger id and a `parentSession` compare equal. */
    function normalizeId(raw) {
      var text = String(raw || "");
      var prefixes = ["import-session-", "import-", "session-"];
      for (var index = 0; index < prefixes.length; index += 1) {
        if (text.indexOf(prefixes[index]) === 0) return text.slice(prefixes[index].length);
      }
      return text;
    }

    /**
     * Fold subagent sessions into the session that started them.
     *
     * When the parent is not in the ledger at all (its files are long gone) the
     * children still fold together under its id, rendered as a synthetic
     * "parent not recorded" row rather than one row per subagent.
     */
    function groupSessions(sessions, range) {
      var byId = {};
      for (var index = 0; index < sessions.length; index += 1) byId[normalizeId(sessions[index].id)] = sessions[index];

      function rootOf(session) {
        var seen = {};
        var current = session;
        while (true) {
          var key = normalizeId(current.id);
          if (seen[key]) return current;
          seen[key] = true;
          var parent = normalizeId(current.parent || "");
          if (parent === "") return current;
          var next = byId[parent];
          if (next === undefined) {
            return { id: String(current.parent), parent: "", title: "", cwd: current.cwd || "", synthetic: true };
          }
          current = next;
        }
      }

      var groups = {};
      var order = [];
      for (var s = 0; s < sessions.length; s += 1) {
        var session = sessions[s];
        var totals = sessionInRange(session, range);
        if (range !== "all" && totals.tokens <= 0) continue;
        var root = rootOf(session);
        var key = normalizeId(root.id);
        var group = groups[key];
        if (group === undefined) {
          group = {
            key: key,
            session: root,
            synthetic: root.synthetic === true,
            totals: emptyAggregate(),
            subagents: 0,
            deletedSubagents: 0,
            lastSeenAt: 0,
            turns: 0,
            hasActive: false,
            hasArchived: false,
            hasDeleted: false,
            state: root.state || "active",
            haystack: [],
          };
          groups[key] = group;
          order.push(group);
        }
        group.totals.input += totals.input;
        group.totals.cacheRead += totals.cacheRead;
        group.totals.cacheWrite += totals.cacheWrite;
        group.totals.output += totals.output;
        group.totals.tokens += totals.tokens;
        group.totals.sessions += 1;
        group.totals.cost += totals.cost || 0;
        group.turns += session.turns || 0;
        group.lastSeenAt = Math.max(group.lastSeenAt, session.lastSeenAt || 0);
        if (normalizeId(session.id) !== key) {
          group.subagents += 1;
          if (session.state === "deleted") group.deletedSubagents += 1;
        }
        if (session.state === "active") group.hasActive = true;
        else if (session.state === "archived") group.hasArchived = true;
        else group.hasDeleted = true;
        group.haystack.push(
          [session.title, session.cwd, session.model, session.provider, session.subagent].join(" ").toLowerCase(),
        );
      }
      for (var g = 0; g < order.length; g += 1) {
        var entry = order[g];
        if (entry.synthetic) entry.state = entry.hasActive ? "active" : entry.hasArchived ? "archived" : "deleted";
        entry.haystack = entry.haystack.join(" ");
      }
      return order.sort(function (left, right) {
        return right.lastSeenAt - left.lastSeenAt;
      });
    }

    // ---------------------------------------------------------------------
    // Components
    // ---------------------------------------------------------------------

    /** The global panel icon: bars for usage. */
    function PanelIcon(props) {
      var size = typeof props.size === "number" ? props.size : 18;
      return h(
        "svg",
        { width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true },
        h("path", { d: "M4 20v-8", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
        h("path", { d: "M10 20V5", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
        h("path", { d: "M16 20v-5", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
        h("path", { d: "M22 20V8", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", opacity: 0.5 }),
      );
    }

    function Segmented(props) {
      return h(
        "div",
        { className: "dul_seg", role: "group", "aria-label": props.label },
        props.options.map(function (option) {
          var on = option.value === props.value;
          return h(
            "button",
            {
              key: option.value,
              type: "button",
              className: "dul_segBtn" + (on ? " dul_segBtnOn" : ""),
              "aria-pressed": on,
              onClick: function () {
                props.onChange(option.value);
              },
            },
            option.label,
          );
        }),
      );
    }

    function Kpi(props) {
      return h(
        "div",
        { className: "dul_kpi" },
        h("span", { className: "dul_kpiLabel" }, props.label),
        h("span", { className: "dul_kpiValue" }, props.value),
        props.hint ? h("span", { className: "dul_kpiHint", title: props.hint }, props.hint) : null,
      );
    }

    function Donut(props) {
      var size = props.size || 96;
      var stroke = props.stroke || 11;
      var radius = (size - stroke) / 2;
      var circumference = 2 * Math.PI * radius;
      var total = 0;
      for (var index = 0; index < props.slices.length; index += 1) total += props.slices[index].value;
      var offset = 0;
      var circles = [];
      var highlight = typeof props.highlight === "number" ? props.highlight : null;
      // Each slice needs its own handler scope: a handler closed over the loop
      // variable would report the final index and dim every slice.
      var makeCircle = function (index, slice, length, start) {
        return h("circle", {
          key: slice.key,
          cx: size / 2,
          cy: size / 2,
          r: radius,
          fill: "none",
          stroke: PALETTE[index % PALETTE.length],
          strokeWidth: highlight === index ? stroke + 4 : stroke,
          strokeDasharray: length + " " + (circumference - length),
          strokeDashoffset: -start,
          strokeLinecap: "butt",
          transform: "rotate(-90 " + size / 2 + " " + size / 2 + ")",
          opacity: highlight === null || highlight === index ? 1 : 0.25,
          "data-selectable": typeof props.onSelect === "function" ? "true" : undefined,
          onClick: function () {
            if (typeof props.onSelect === "function") props.onSelect(slice);
          },
          onMouseEnter: function () {
            if (typeof props.onHover === "function") props.onHover(index);
          },
          onMouseLeave: function () {
            if (typeof props.onHover === "function") props.onHover(null);
          },
        });
      };
      for (var s = 0; s < props.slices.length; s += 1) {
        var slice = props.slices[s];
        if (slice.value <= 0 || total <= 0) continue;
        var length = (slice.value / total) * circumference;
        circles.push(makeCircle(s, slice, length, offset));
        offset += length;
      }
      return h(
        "div",
        { className: "dul_donut", title: props.centerTitle, style: { width: size + "px", height: size + "px" } },
        h(
          "svg",
          { width: size, height: size, "aria-hidden": true },
          h("circle", {
            cx: size / 2,
            cy: size / 2,
            r: radius,
            fill: "none",
            stroke: "var(--dsw-alias-border-l1)",
            strokeWidth: stroke,
          }),
          circles,
        ),
        h(
          "div",
          { className: "dul_donutCenter" },
          h("span", { className: "dul_donutValue" }, props.centerValue),
          props.centerLabel ? h("span", { className: "dul_donutLabel" }, props.centerLabel) : null,
        ),
      );
    }

    /** Two-column legend whose labels carry their slice colour. */
    function CompositionLegend(props) {
      var total = 0;
      for (var index = 0; index < props.rows.length; index += 1) total += props.rows[index].value;
      return h(
        "div",
        { className: "dul_clegend" },
        props.rows.map(function (row, position) {
          var color = PALETTE[position % PALETTE.length];
          return h(
            typeof props.onSelect === "function" ? "button" : "div",
            {
              type: typeof props.onSelect === "function" ? "button" : undefined,
              className: "dul_clegendItem" + (props.hover === position ? " dul_clegendItemOn" : ""),
              key: row.key,
              title: row.label + " · " + row.text,
              onClick: function () {
                if (typeof props.onSelect === "function") props.onSelect(row);
              },
              onFocus: function () {
                if (typeof props.onHover === "function") props.onHover(position);
              },
              onBlur: function () {
                if (typeof props.onHover === "function") props.onHover(null);
              },
              onMouseEnter: function () {
                if (typeof props.onHover === "function") props.onHover(position);
              },
              onMouseLeave: function () {
                if (typeof props.onHover === "function") props.onHover(null);
              },
            },
            h(
              "div",
              { className: "dul_clegendLine" },
              h("span", { className: "dul_clegendName", style: { color: color }, title: row.label }, row.label),
              h("span", { className: "dul_clegendPct", style: { color: color } }, formatShare(row.value, total)),
            ),
            h("div", { className: "dul_clegendValue" }, row.text),
          );
        }),
      );
    }

    function Legend(props) {
      var total = 0;
      for (var index = 0; index < props.rows.length; index += 1) total += props.rows[index].value;
      return h(
        "div",
        { className: "dul_legend" },
        props.rows.map(function (row, position) {
          return h(
            "div",
            { className: "dul_legendRow", key: row.key },
            h("span", {
              className: "dul_dot",
              style: { background: PALETTE[position % PALETTE.length] },
            }),
            h("span", { className: "dul_legendName", title: row.label }, row.label),
            h("span", { className: "dul_legendValue" }, row.text),
            h("span", { className: "dul_legendPct" }, formatShare(row.value, total)),
          );
        }),
      );
    }

    /**
     * Tokens and estimated cost have separate labelled axes. Each day opens
     * the exact session contributions rather than only a hover tooltip.
     */
    function DailyChart(props) {
      var t = props.t;
      var currency = t("number.system") === "en" ? "$" : "¥";
      var rate = currency === "$" ? 1 : props.rate || 7.2;
      var series = props.series;
      var [hover, setHover] = useState(null);

      var maxTokens = 0;
      var maxCost = 0;
      for (var index = 0; index < series.length; index += 1) {
        maxTokens = Math.max(maxTokens, series[index].tokens);
        maxCost = Math.max(maxCost, (series[index].cost || 0) * rate);
      }

      var groups = series.map(function (point, position) {
        var tokenHeight = maxTokens > 0 ? (point.tokens / maxTokens) * 100 : 0;
        var costHeight = maxCost > 0 ? ((point.cost || 0) * rate / maxCost) * 100 : 0;
        return h(
          "button",
          {
            type: "button",
            key: point.key,
            className: "dul_dayGroup" + (hover === position ? " dul_dayGroupOn" : ""),
            "aria-label": point.key + " · " + t("tip.tokens") + " " + formatTokens(point.tokens, t) + " · " + t("tip.cost") + " " + formatCost(point.cost, rate, t),
            onClick: function () { if (props.onSelect) props.onSelect(point.key); },
            onFocus: function () { setHover(position); },
            onBlur: function () { setHover(null); },
            onMouseEnter: function () {
              setHover(position);
            },
            onMouseLeave: function () {
              setHover(null);
            },
          },
          h(
            "div",
            { className: "dul_dayBars" },
            point.tokens > 0
              ? h("div", { className: "dul_bar", style: { height: Math.max(tokenHeight, 3) + "%", background: PALETTE[0] } })
              : h("div", { className: "dul_barEmpty" }),
            (point.cost || 0) > 0
              ? h("div", { className: "dul_bar", style: { height: Math.max(costHeight, 3) + "%", background: PALETTE[1] } })
              : h("div", { className: "dul_barEmpty" }),
          ),
          point.tokens > 0 || (point.cost || 0) > 0
            ? (function (tokenTop, costTop) {
                var labelBottom = Math.min(92, Math.max(tokenTop, costTop));
                return h(
                  "span",
                  { className: "dul_dayValue", style: { bottom: labelBottom + "%" } },
                  point.tokens > 0
                    ? h("span", { style: { color: PALETTE[0] } }, formatMetric(point.tokens))
                    : null,
                  (point.cost || 0) > 0
                    ? h("span", { style: { color: PALETTE[1] } }, currency + ((point.cost || 0) * rate).toFixed(2))
                    : null,
                );
              })(tokenHeight, costHeight)
            : null,
        );
      });

      var hovered = hover !== null && hover >= 0 && hover < series.length ? series[hover] : null;
      var tooltip =
        hovered === null
          ? null
          : h(
              "div",
              {
                className: "dul_dayTip",
                style: { left: Math.min(86, Math.max(14, ((hover + 0.5) / series.length) * 100)) + "%" },
              },
              h("div", { className: "dul_dayTipDate" }, hovered.key),
              h("div", null, t("tip.tokens") + " " + formatMetric(hovered.tokens)),
              h("div", null, t("tip.cost") + " " + formatCost(hovered.cost, rate, t)),
            );

      var ticks = [];
      if (series.length > 0) {
        var positions = [0, Math.floor(series.length / 3), Math.floor((series.length * 2) / 3), series.length - 1];
        for (var p = 0; p < positions.length; p += 1) ticks.push(series[positions[p]].key.slice(5));
      }

      return h(
        "div",
        { className: "dul_card" + (props.cardClass ? " " + props.cardClass : "") },
        h(
          "div",
          { className: "dul_cardHead" },
          h("span", { className: "dul_cardTitle" }, props.title),
          h("span", { className: "dul_cardHint" }, props.hint),
        ),
        maxTokens > 0 || maxCost > 0
          ? h(
              "div",
              { className: "dul_plotRow" },
              h(
                "div",
                { className: "dul_yaxisCol" },
                h("span", null, formatMetric(maxTokens)),
                h("span", null, formatMetric(maxTokens * 0.75)),
                h("span", null, formatMetric(maxTokens / 2)),
                h("span", null, formatMetric(maxTokens * 0.25)),
                h("span", null, "0"),
              ),
              h(
                "div",
                { className: "dul_plot" },
                h("div", { className: "dul_gridline", style: { top: 0 } }),
                h("div", { className: "dul_gridline", style: { top: "25%" } }),
                h("div", { className: "dul_gridline", style: { top: "50%" } }),
                h("div", { className: "dul_gridline", style: { top: "75%" } }),
                h("div", { className: "dul_gridline", style: { bottom: 0 } }),
                h("div", { className: "dul_chart" }, groups),
                tooltip,
              ),
              h(
                "div",
                { className: "dul_yaxisCol dul_yaxisRight" },
                h("span", null, currency + maxCost.toFixed(2)),
                h("span", null, currency + (maxCost * 0.75).toFixed(2)),
                h("span", null, currency + (maxCost / 2).toFixed(2)),
                h("span", null, currency + (maxCost * 0.25).toFixed(2)),
                h("span", null, currency + "0"),
              ),
            )
          : h("div", { className: "dul_empty" }, props.empty),
        h(
          "div",
          { className: "dul_axis", style: { paddingLeft: "46px", paddingRight: "46px" } },
          ticks.map(function (label, position) {
            return h("span", { key: label + position }, label);
          }),
        ),
        h(
          "div",
          { className: "dul_chartLegend", style: { paddingLeft: "46px" } },
          h("span", null, h("span", { className: "dul_dot", style: { background: PALETTE[0] } }), t("tip.tokens")),
          h("span", null, h("span", { className: "dul_dot", style: { background: PALETTE[1] } }), t("tip.cost")),
        ),
      );
    }

    /**
     * Eight natural weeks, Monday-first, so a column is one week and a row is
     * one weekday. Cells carry their own date, so hovering names the day even
     * when it has no usage.
     */
    function Heatmap(props) {
      var t = props.t;
      var byDay = {};
      for (var index = 0; index < props.series.length; index += 1) byDay[props.series[index].key] = props.series[index].tokens;
      var max = 0;
      for (var key in byDay) if (byDay[key] > max) max = byDay[key];

      var today = new Date();
      today.setHours(0, 0, 0, 0);
      var weekday = (today.getDay() + 6) % 7; // Monday = 0
      var start = new Date(today.getTime() - (weekday + 7 * 7) * 86400000);

      var weeks = [];
      var months = [];
      var previousMonth = -1;
      for (var w = 0; w < 8; w += 1) {
        var columnStart = new Date(start.getTime() + w * 7 * 86400000);
        var month = columnStart.getMonth();
        months.push(month !== previousMonth ? month + 1 + "月" : "");
        previousMonth = month;
        var column = [];
        for (var d = 0; d < 7; d += 1) {
          var date = new Date(columnStart.getTime() + d * 86400000);
          if (date.getTime() > today.getTime()) {
            column.push(null);
            continue;
          }
          var dayKey = dayKeyOf(date);
          column.push({ key: dayKey, tokens: byDay[dayKey] || 0, time: date.getTime() });
        }
        weeks.push(column);
      }

      var dowLabels = ["一", "二", "三", "四", "五", "六", "日"];
      var rows = [];
      for (var r = 0; r < 7; r += 1) {
        var cells = [];
        for (var c = 0; c < weeks.length; c += 1) {
          var cell = weeks[c][r];
          if (cell === null) {
            cells.push(h("div", { key: "empty-" + c, className: "dul_cell dul_cellEmpty" }));
            continue;
          }
          var ratio = max > 0 ? cell.tokens / max : 0;
          cells.push(
            h("button", {
              type: "button",
              key: cell.key,
              className: "dul_cell",
              title: cell.key + " · " + formatTokens(cell.tokens, t),
              "aria-label": cell.key + " · " + formatTokens(cell.tokens, t) + " " + t("tip.tokens"),
              onClick: (function (key) { return function () { if (props.onSelect) props.onSelect(key); }; })(cell.key),
              style:
                cell.tokens <= 0
                  ? undefined
                  : { background: PALETTE[0], opacity: 0.2 + ratio * 0.8 },
            }),
          );
        }
        rows.push(
          h(
            "div",
            { className: "dul_heatRow", key: "row-" + r },
            h("span", { className: "dul_heatDow" }, r % 2 === 0 ? dowLabels[r] : ""),
            cells,
          ),
        );
      }

      return h(
        "div",
        { className: "dul_card" + (props.cardClass ? " " + props.cardClass : "") },
        h(
          "div",
          { className: "dul_cardHead" },
          h("span", { className: "dul_cardTitle" }, props.title),
          h("span", { className: "dul_cardHint" }, props.hint),
        ),
        h(
          "div",
          { className: "dul_heat" },
          h(
            "div",
            { className: "dul_heatRow dul_heatRowHead" },
            h("span", { className: "dul_heatDow" }),
            months.map(function (label, position) {
              return h("span", { key: "month-" + position, className: "dul_heatMonth" }, label);
            }),
          ),
          rows,
        ),
        h(
          "div",
          { className: "dul_heatLegend" },
          h("span", null, props.less),
          [0.2, 0.4, 0.6, 0.8, 1].map(function (opacity) {
            return h("span", {
              key: opacity,
              className: "dul_swatch",
              style: { background: PALETTE[0], opacity: opacity },
            });
          }),
          h("span", null, props.more),
        ),
      );
    }

    /** One row per skill that was injected into the context. */
    function SkillList(props) {
      var t = props.t;
      if (props.skills.length === 0) return h("div", { className: "dul_empty" }, t("skill.empty"));
      return h(
        "div",
        { className: "dul_skillList" },
        props.skills.map(function (skill, index) {
          return h(
            "button",
            { type: "button", className: "dul_skillRow", key: skill.name, title: skill.name,
              onClick: function () { if (props.onSelect) props.onSelect(skill.name); } },
            h("span", { className: "dul_skillDot", style: { background: PALETTE[index % PALETTE.length] } }),
            h("span", { className: "dul_skillName", title: skill.name }, skill.name),
            h("span", { className: "dul_skillCount" }, "×" + skill.count),
            h("span", { className: "dul_skillWhen" }, formatWhen(skill.lastAt, t)),
          );
        }),
      );
    }

    function usePreference(key, fallback, choices) {
      var pair = useState(function () {
        try {
          var saved = window.localStorage.getItem(NS + ":" + key);
          return choices.indexOf(saved) >= 0 ? saved : fallback;
        } catch (_) { return fallback; }
      });
      useEffect(function () {
        try { window.localStorage.setItem(NS + ":" + key, pair[0]); } catch (_) {}
      }, [key, pair[0]]);
      return pair;
    }

    /** Detail values come from the same records as the selected chart. */
    function detailRows(sessions, selection, range) {
      if (!selection || selection.kind === "skills") return [];
      var rows = [];
      for (var i = 0; i < sessions.length; i += 1) {
        var session = sessions[i];
        var totals = sessionInRange(session, range);
        if (selection.kind !== "day" && range !== "all" && totals.tokens <= 0) continue;
        var value = 0;
        var tokens = totals.tokens;
        var cost = totals.cost;
        var matched = false;
        if (selection.kind === "day") {
          var day = (session.days || {})[selection.key];
          if (!day) continue;
          value = tokens = day.tokens || 0;
          cost = day.cost || 0;
          matched = value > 0 || (day.requests || 0) > 0 || cost > 0;
        } else if (selection.kind === "skill") {
          var skills = session.skills || [];
          tokens = 0;
          for (var s = 0; s < skills.length; s += 1) {
            if (skills[s].name !== selection.key) continue;
            value += skills[s].count || 0;
            tokens += skills[s].tokens || 0;
            matched = true;
          }
        } else if (selection.kind === "composition") {
          value = selection.key === "other"
            ? (!session.composition ? totals.tokens : 0)
            : ((session.composition || {})[selection.key] || 0);
        } else if (selection.kind === "timing") {
          var fields = { wait: "ttftMs", reasoning: "reasoningMs", reply: "textMs", toolArg: "toolArgMs", toolExec: "toolsMs" };
          value = selection.key === "other"
            ? Math.max(0, (session.wallMs || 0) - (session.ttftMs || 0) - (session.reasoningMs || 0) - (session.textMs || 0) - (session.toolArgMs || 0) - (session.toolsMs || 0))
            : (session[fields[selection.key]] || 0);
        }
        if (value <= 0 && !matched) continue;
        rows.push({ session: session, value: value, tokens: tokens, cost: cost });
      }
      return rows.sort(function (a, b) { return b.value - a.value || (b.session.lastSeenAt || 0) - (a.session.lastSeenAt || 0); });
    }

    /** Shared modal boundary: Escape, focus containment, and focus restoration. */
    function ModalShell(props) {
      var root = useRef(null);
      var latest = useRef(props);
      latest.current = props;
      useEffect(function () {
        var previous = document.activeElement;
        var first = root.current && root.current.querySelector("button:not(:disabled)");
        if (first) first.focus();
        function onKey(event) {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            if (!latest.current.busy) latest.current.onClose();
          }
          if (event.key !== "Tab" || !root.current) return;
          var targets = root.current.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]");
          if (!targets.length) { event.preventDefault(); return; }
          var firstTarget = targets[0];
          var lastTarget = targets[targets.length - 1];
          if (event.shiftKey && (document.activeElement === firstTarget || !root.current.contains(document.activeElement))) {
            event.preventDefault(); lastTarget.focus();
          } else if (!event.shiftKey && (document.activeElement === lastTarget || !root.current.contains(document.activeElement))) {
            event.preventDefault(); firstTarget.focus();
          }
        }
        document.addEventListener("keydown", onKey, true);
        return function () {
          document.removeEventListener("keydown", onKey, true);
          if (previous && previous.isConnected && typeof previous.focus === "function") previous.focus();
        };
      }, []);
      return h("div", {
        className: "dul_overlay",
        onClick: function (event) { if (event.target === event.currentTarget && !props.busy) props.onClose(); },
      }, h("section", { ref: root, className: "dul_dialog", role: "dialog", "aria-modal": "true", "aria-label": props.title, "aria-busy": props.busy || undefined }, props.children));
    }

    function SessionActions(props) {
      var row = props.row;
      var t = props.t;
      if (!props.canManage || row.synthetic) return h("span", { className: "dul_muted" }, "—");
      var name = row.session.title || t("untitled");
      var options = row.state === "active" ? ["archive"] : row.state === "archived" ? ["unarchive", "delete"] : row.state === "deleted" ? ["forget"] : [];
      if (!options.length) return "—";
      return h("select", {
        className: "dul_select dul_actionSelect", value: "", disabled: props.busy,
        "aria-label": t("action.menu") + " · " + name,
        onChange: function (event) {
          var kind = event.target.value;
          if (kind === "unarchive") props.onUnarchive(row.session.id);
          else if (kind) props.onAsk(kind, row.session.id, name);
        },
      }, h("option", { value: "" }, t("action.menu")), options.map(function (kind) { return h("option", { key: kind, value: kind }, t(kind + ".action")); }));
    }

    function SessionTable(props) {
      var t = props.t;
      if (!props.rows.length) return h("div", { className: "dul_empty" }, t("empty.filtered"));
      return h("div", { className: "dul_tableWrap" }, h("table", { className: "dul_table", "aria-label": t("sessions.title") },
        h("thead", null, h("tr", null, ["session", "tokens", "cost", "cache", "last", "state", "actions"].map(function (key) {
          return h("th", { key: key, scope: "col", className: ["tokens", "cost", "cache"].indexOf(key) >= 0 ? "dul_num" : undefined }, t("table." + key));
        }))),
        h("tbody", null, props.rows.map(function (row) {
          var session = row.session;
          var name = row.synthetic ? t("group.orphanTitle") : session.title || t("untitled");
          var openable = row.state === "active" && !row.synthetic && typeof props.onOpen === "function";
          return h("tr", { key: row.key || session.id },
            h("td", null, h("div", { className: "dul_name" },
              h(openable ? "button" : "span", { type: openable ? "button" : undefined, className: openable ? "dul_sessionOpen" : "dul_nameText dul_strong", title: name, onClick: openable ? function () { props.onOpen(session.id); } : undefined }, name),
              h("div", { className: "dul_sessionMeta", title: [session.cwd, session.model].filter(Boolean).join(" · ") },
                h("span", null, session.cwd || session.id),
                session.model ? h("span", null, session.model) : null,
                row.subagents > 0 ? h("span", { className: "dul_chip" }, t("group.subagents", { n: row.subagents })) : null))),
            h("td", { className: "dul_num dul_strong", title: String(row.totals.tokens) }, formatTokens(row.totals.tokens, t)),
            h("td", { className: "dul_num" }, formatCost(row.totals.cost, props.rate, t)),
            h("td", { className: "dul_num" }, row.totals.input + row.totals.cacheRead > 0 ? formatPercent(cacheHitOf(row.totals)) : "—"),
            h("td", { className: "dul_num", title: row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString() : undefined }, formatWhen(row.lastSeenAt, t)),
            h("td", null, h(StateBadge, { state: row.state, t: t })),
            h("td", null, h(SessionActions, Object.assign({}, props, { row: row }))));
        }))));
    }

    /** Read-only drilldowns stay inside the plugin page, without a modal layer. */
    function DetailPanel(props) {
      var selection = props.selection;
      var t = props.t;
      var panel = useRef(null);
      var latest = useRef(props);
      latest.current = props;
      useEffect(function () {
        var back = panel.current && panel.current.querySelector(".dul_detailBack");
        if (back) back.focus();
        function onKey(event) {
          if (event.key === "Escape") { event.preventDefault(); latest.current.onClose(); }
        }
        document.addEventListener("keydown", onKey);
        return function () { document.removeEventListener("keydown", onKey); };
      }, [selection.kind, selection.key]);
      var title = selection.kind === "day" ? t("detail.day", { date: selection.key }) : selection.kind === "skill" ? t("detail.skill", { name: selection.key }) : selection.kind === "skills" ? t("skill.title") : t((selection.kind === "timing" ? "timec." : "compose.") + selection.key);
      var rows = detailRows(props.sessions, selection, props.range);
      var sum = rows.reduce(function (total, row) { return total + row.value; }, 0);
      var tokens = rows.reduce(function (total, row) { return total + row.tokens; }, 0);
      var cost = rows.reduce(function (total, row) { return total + row.cost; }, 0);
      function formatValue(value) { return selection.kind === "timing" ? formatDuration(value, t) : selection.kind === "skill" ? "×" + value : formatTokens(value, t) + " Token"; }
      var secondaryLabel = selection.kind === "day" ? t("kpi.cost") : selection.kind === "skill" ? t("detail.skillTokens") : "";
      var secondaryValue = selection.kind === "day" ? formatCost(cost, props.rate, t) : formatTokens(tokens, t) + " Token";
      return h("section", { ref: panel, className: "dul_detailPanel", role: "region", "aria-label": title },
        h("header", { className: "dul_detailHead" },
          h("button", { type: "button", className: "dul_btn dul_detailBack", onClick: props.onClose },
            h("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true }, h("path", { d: "M14 6l-6 6 6 6M8 12h12", strokeLinecap: "round", strokeLinejoin: "round" })), t("detail.back")),
          h("div", { className: "dul_detailCrumb" }, h("span", null, t("nav.overview")), h("span", { "aria-hidden": true }, "/"), h("h2", null, title))),
        h("div", { className: "dul_detailBody" }, selection.kind === "skills"
          ? h(SkillList, { t: t, skills: props.skills, onSelect: props.onSkill })
          : h(React.Fragment, null,
              h("div", { className: "dul_detailStats" },
                h("div", { className: "dul_detailStat" }, h("span", { className: "dul_detailStatLabel" }, t("detail.total")), h("strong", { className: "dul_detailValue" }, formatValue(sum))),
                secondaryLabel ? h("div", { className: "dul_detailStat" }, h("span", { className: "dul_detailStatLabel" }, secondaryLabel), h("strong", { className: "dul_detailSecondary" }, secondaryValue)) : null),
              h("p", { className: "dul_detailHint" }, selection.kind === "day" ? t("detail.dayHint") : t("detail.cumulative")),
              h("div", { className: "dul_detailListHead" }, h("span", null, t("detail.sessions", { n: rows.length })), h("span", null, selection.kind === "timing" ? t("kpi.activeTime") : selection.kind === "skill" ? t("skill.title") : t("kpi.tokens"))),
              rows.length === 0 ? h("div", { className: "dul_empty" }, t("detail.empty")) : h("ul", { className: "dul_detailList" }, rows.map(function (row) {
                var session = row.session;
                var openable = session.state === "active" && typeof props.onOpen === "function";
                var name = session.title || t("untitled");
                return h("li", { className: "dul_detailRow", key: session.id },
                  h("div", { className: "dul_detailName" },
                    h("div", { className: "dul_detailTitle" }, h(openable ? "button" : "strong", { type: openable ? "button" : undefined, className: (openable ? "dul_sessionOpen " : "") + "dul_detailSessionName", onClick: openable ? function () { props.onOpen(session.id); } : undefined, title: name }, name), h(StateBadge, { state: session.state, t: t })),
                    h("div", { className: "dul_sessionMeta", title: session.cwd || session.id }, h("span", null, session.cwd || session.id))),
                  h("div", { className: "dul_detailMetric" }, h("strong", null, formatValue(row.value)),
                    selection.kind === "day" ? h("div", { className: "dul_muted" }, formatCost(row.cost, props.rate, t)) : selection.kind === "skill" ? h("div", { className: "dul_muted" }, formatTokens(row.tokens, t) + " Token") : null));
              })))));
    }

    /** Keep the confirmation visible until its request succeeds. */
    function ConfirmDialog(props) {
      var t = props.t;
      return h(
        ModalShell,
        { title: props.title, busy: props.busy, onClose: props.onCancel },
        h(
          "div",
          null,
          h("h2", { className: "dul_dialogTitle" }, props.title),
          h("p", { className: "dul_dialogText" }, props.message),
          props.error ? h("p", { className: "dul_error", role: "alert" }, props.error) : null,
          h(
            "div",
            { className: "dul_dialogActions" },
            h(
              "button",
              { type: "button", className: "dul_btn", disabled: props.busy, autoFocus: true, onClick: props.onCancel },
              t("delete.cancel"),
            ),
            h(
              "button",
              {
                type: "button",
                className: "dul_btn " + (props.danger ? "dul_btnDanger" : "dul_btnPrimary"),
                disabled: props.busy,
                onClick: props.onConfirm,
              },
              props.busy ? t("action.working") : props.confirmLabel,
            ),
          ),
        ),
      );
    }

    function StateBadge(props) {
      var className =
        props.state === "deleted"
          ? "dul_badge dul_badgeDeleted"
          : props.state === "archived" || props.state === "forgotten"
            ? "dul_badge dul_badgeArchived"
            : "dul_badge dul_badgeActive";
      return h("span", { className: className }, props.t("state." + props.state));
    }

    /** One card per session group: composition ring, three stats, actions. */
    function SessionCards(props) {
      var t = props.t;
      if (props.rows.length === 0 && !props.aggregate) return h("div", { className: "dul_empty" }, t("empty.filtered"));
      var cards = props.rows.map(function (row) {
        var session = row.session;
        var totals = row.totals;
        var composition = [
          { key: "input", value: totals.input },
          { key: "cacheRead", value: totals.cacheRead },
          { key: "output", value: totals.output },
        ];
        // The card ring mirrors the big composition ring: same categories, same
        // palette order, so a colour means the same thing in both places.
        var sessionComposition = session.composition;
        if (sessionComposition !== null && sessionComposition !== undefined) {
          composition = [
            { key: "system", value: sessionComposition.system || 0 },
            { key: "tools", value: sessionComposition.tools || 0 },
            { key: "user", value: sessionComposition.user || 0 },
            { key: "inject", value: sessionComposition.inject || 0 },
            { key: "skill", value: sessionComposition.skill || 0 },
            { key: "assistant", value: sessionComposition.assistant || 0 },
            { key: "tool", value: sessionComposition.tool || 0 },
          ];
        }
        var displayName = row.synthetic ? t("group.orphanTitle") : session.title || t("untitled");
        var actions = null;
        if (props.canManage && !row.synthetic) {
          if (row.state === "archived") {
            actions = h(
              "span",
              { className: "dul_cellActions" },
              h(
                "button",
                {
                  type: "button",
                  className: "dul_sbtn",
                  disabled: props.busy,
                  onClick: function (event) {
                    event.stopPropagation();
                    props.onUnarchive(session.id);
                  },
                },
                t("unarchive.action"),
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "dul_sbtn dul_sbtnDanger",
                  disabled: props.busy,
                  onClick: function (event) {
                    event.stopPropagation();
                    props.onAsk("delete", session.id, displayName);
                  },
                },
                t("delete.action"),
              ),
            );
          } else if (row.state === "active") {
            actions = h(
              "button",
              {
                type: "button",
                className: "dul_sbtn",
                disabled: props.busy,
                onClick: function (event) {
                  event.stopPropagation();
                  props.onAsk("archive", session.id, displayName);
                },
              },
              t("archive.action"),
            );
          } else if (row.state === "deleted") {
            actions = h(
              "button",
              {
                type: "button",
                className: "dul_sbtn",
                disabled: props.busy,
                onClick: function (event) {
                  event.stopPropagation();
                  props.onAsk("forget", session.id, displayName);
                },
              },
              t("forget.action"),
            );
          }
        }
        var openable = row.state === "active" && !row.synthetic && typeof props.onOpen === "function";
        return h(
          "div",
          {
            key: session.id,
            className: "dul_scard" + (openable ? " dul_scardClickable" : ""),
            title: openable ? t("card.open") : undefined,
            onClick: openable
              ? function () {
                  props.onOpen(session.id);
                }
              : undefined,
          },
          h(
            "div",
            { className: "dul_scardHead" },
            h(
              "h3",
              { className: "dul_scardTitle", title: session.title || session.id },
              openable ? h("button", {
                type: "button", className: "dul_sessionOpen",
                onClick: function (event) { event.stopPropagation(); props.onOpen(session.id); },
              }, session.title || t("untitled")) : row.synthetic ? t("group.orphanTitle") : session.title || t("untitled"),
            ),
            h(StateBadge, { state: row.state, t: t }),
          ),
          h(
            "div",
            { className: "dul_scardMeta" },
            h(
              "span",
              { className: "dul_scardMetaText", title: session.cwd },
              row.synthetic
                ? t("group.orphanId", { id: session.id.replace(/^session-/, "").slice(0, 8) })
                : session.cwd || session.id,
            ),
            row.subagents > 0
              ? h(
                  "span",
                  { className: "dul_chip" },
                  row.deletedSubagents > 0
                    ? t("group.subagentsDeleted", { n: row.subagents, m: row.deletedSubagents })
                    : t("group.subagents", { n: row.subagents }),
                )
              : null,
          ),
          h(
            "div",
            { className: "dul_scardBody" },
            h(Donut, {
              size: 54,
              stroke: 8,
              slices: composition,
              centerValue: formatTokens(totals.tokens, t),
              centerLabel: t("donut.total"),
            }),
            h(
              "div",
              { className: "dul_scardStats" },
              h("span", { className: "dul_scardStatLabel" }, t("table.turns")),
              h("span", { className: "dul_scardStatValue" }, String(row.turns || 0)),
              h("span", { className: "dul_scardStatLabel" }, t("table.cache")),
              h(
                "span",
                { className: "dul_scardStatValue" },
                totals.input + totals.cacheRead > 0 ? formatPercent(cacheHitOf(totals)) : "—",
              ),
              h("span", { className: "dul_scardStatLabel" }, t("table.last")),
              h("span", { className: "dul_scardStatValue" }, formatWhen(row.lastSeenAt || session.lastSeenAt, t)),
            ),
          ),
          h("div", { className: "dul_scardFoot" }, actions),
        );
      });
      var aggregate = props.aggregate
        ? h(
            "div",
            { className: "dul_scard dul_scardAgg" },
            h(
              "div",
              { className: "dul_scardHead" },
              h("h3", { className: "dul_scardTitle" }, t("forgotten.title")),
              h("span", { className: "dul_badge dul_badgeArchived" }, t("forgotten.count", { n: props.aggregate.sessions })),
            ),
            h(
              "div",
              { className: "dul_scardMeta" },
              h("span", { className: "dul_scardMetaText" }, t("forgotten.hint")),
            ),
            h(
              "div",
              { className: "dul_scardStats" },
              h("span", { className: "dul_scardStatLabel" }, t("tip.tokens")),
              h("span", { className: "dul_scardStatValue" }, formatTokens(props.aggregate.tokens, t)),
              h("span", { className: "dul_scardStatLabel" }, t("tip.cost")),
              h(
                "span",
                { className: "dul_scardStatValue" },
                formatCost(props.aggregate.cost, props.rate, t),
              ),
            ),
          )
        : null;
      return h("div", { className: "dul_cards" }, cards, aggregate);
    }

    function LedgerPage(props) {
      var t = props.t;
      var [phase, setPhase] = useState("loading");
      var [data, setData] = useState(null);
      var [error, setError] = useState("");
      var [range, setRange] = usePreference("range", "all", ["all", "30d", "7d"]);
      var [depth, setDepth] = usePreference("depth", "root", ["root", "all"]);
      var [scope, setScope] = useState("all");
      var [query, setQuery] = useState("");
      var [loading, setLoading] = useState(false);
      var [confirm, setConfirm] = useState(null);
      var [busy, setBusy] = useState(false);
      var [notice, setNotice] = useState("");
      var [noticeError, setNoticeError] = useState(false);
      var [dialogError, setDialogError] = useState("");
      var [detail, setDetail] = useState(null);
      var [sort, setSort] = usePreference("sort", "recent", ["recent", "tokens", "cost", "turns"]);
      var [view, setView] = usePreference("view", "list", ["list", "cards"]);
      var [tab, setTab] = usePreference("tab", "overview", ["overview", "sessions"]);
      var [perPage, setPerPage] = usePreference("page-size", "auto", ["auto", "12", "24", "48"]);
      var [page, setPage] = useState(0);
      var [hoverSlice, setHoverSlice] = useState(null);
      var [hoverTime, setHoverTime] = useState(null);
      var dense = view === "list";
      var pageSize = perPage === "auto" ? (dense ? 25 : 9) : Number(perPage);
      var pageRoot = useRef(null);
      var detailReturn = useRef(null);
      var requestSerial = useRef(0);
      var mounted = useRef(true);
      var operation = useRef(false);

      function load(scan) {
        if (operation.current) return;
        var serial = ++requestSerial.current;
        setLoading(true);
        request(BASE + "/state" + (scan ? "?scan=1" : ""))
          .then(function (payload) {
            if (!mounted.current || serial !== requestSerial.current) return;
            setData(payload);
            setPhase("ready");
            setError("");
          })
          .catch(function (failure) {
            if (!mounted.current || serial !== requestSerial.current) return;
            setError(String(failure && failure.message ? failure.message : failure));
            if (data === null) setPhase("error");
          })
          .then(function () {
            if (!mounted.current || serial !== requestSerial.current) return;
            setLoading(false);
          });
      }

      useEffect(function () {
        mounted.current = true;
        load(true);
        return function () { mounted.current = false; requestSerial.current += 1; };
      }, []);

      useEffect(function () { setPage(0); }, [scope, query, range, depth, sort, view, perPage]);
      useEffect(function () { if (pageRoot.current) pageRoot.current.scrollTop = 0; }, [tab, page, pageSize]);

      useEffect(function () {
        if (!pageRoot.current) return;
        if (detail !== null) pageRoot.current.scrollTop = 0;
        else if (detailReturn.current) {
          var saved = detailReturn.current;
          detailReturn.current = null;
          if (saved.focus && saved.focus.isConnected) saved.focus.focus();
          pageRoot.current.scrollTop = saved.scrollTop;
        }
      }, [detail]);

      function showDetail(selection) {
        if (detail === null) detailReturn.current = { scrollTop: pageRoot.current ? pageRoot.current.scrollTop : 0, focus: document.activeElement };
        setDetail(selection);
      }

      function act(sessionId, path) {
        if (operation.current) return;
        operation.current = true;
        requestSerial.current += 1;
        setLoading(false);
        setBusy(true);
        setNotice("");
        setDialogError("");
        request(BASE + path, { method: "POST", body: { sessionId: sessionId } })
          .then(function (payload) {
            if (!mounted.current) return;
            setData(payload.state);
            setConfirm(null);
            setNoticeError(false);
            setNotice(t("action.done." + path.slice(1)));
          })
          .catch(function (failure) {
            if (!mounted.current) return;
            var key = "delete.error." + (failure && failure.code ? failure.code : "generic");
            var message = t(key);
            if (message === key) message = t("delete.error.generic");
            if (confirm !== null) setDialogError(message);
            else { setNoticeError(true); setNotice(message); }
          })
          .then(function () {
            operation.current = false;
            if (mounted.current) setBusy(false);
          });
      }

      /** Open the confirmation dialog for one sensitive action. */
      function ask(kind, sessionId, name) {
        setNotice("");
        setDialogError("");
        setConfirm({ kind: kind, id: sessionId, name: name });
      }

      function confirmRun() {
        if (confirm === null) return;
        var path =
          confirm.kind === "archive"
            ? "/archive"
            : confirm.kind === "delete"
              ? "/delete"
              : confirm.kind === "forget"
                ? "/forget"
                : "/unarchive";
        var id = confirm.id;
        act(id, path);
      }

      var derived = useMemo(
        function () {
          if (data === null) return null;
          var everySession = data.sessions || [];
          // The depth switch filters the list only: the cards above and the
          // daily chart always answer for the whole ledger.
          var listSessions =
            depth === "all"
              ? everySession
              : everySession.filter(function (session) {
                  return !session.parent;
                });
          var rows = groupSessions(listSessions, range);

          var byState = {
            active: emptyAggregate(),
            archived: emptyAggregate(),
            deleted: emptyAggregate(),
            forgotten: emptyAggregate(),
          };
          var total = emptyAggregate();
          var rootTotals = emptyAggregate();
          var subagentTotals = emptyAggregate();
          var timing = { toolCalls: 0, toolsMs: 0, modelCalls: 0, wallMs: 0, ttftMs: 0, reasoningMs: 0, textMs: 0, toolArgMs: 0 };
          var compose = { system: 0, tools: 0, user: 0, inject: 0, skill: 0, assistant: 0, tool: 0, other: 0 };
          var skillMap = {};
          var priced = 0;

          var keys = dayKeysBack(56);
          var buckets = {};
          for (var k = 0; k < keys.length; k += 1) buckets[keys[k]] = { alive: 0, deleted: 0, tokens: 0, cost: 0 };

          for (var i = 0; i < everySession.length; i += 1) {
            var session = everySession[i];
            // Fixed-window charts always describe the full ledger; list and
            // KPI range changes must not silently remove older chart activity.
            var sessionDays = session.days || {};
            for (var key in sessionDays) {
              if (!Object.prototype.hasOwnProperty.call(sessionDays, key)) continue;
              var dayBucket = buckets[key];
              if (dayBucket === undefined) continue;
              var dayTokens = sessionDays[key].tokens || 0;
              if (session.state === "deleted") dayBucket.deleted += dayTokens;
              else dayBucket.alive += dayTokens;
              dayBucket.tokens += dayTokens;
              dayBucket.cost += sessionDays[key].cost || 0;
            }
            var totals = sessionInRange(session, range);
            if (range !== "all" && totals.tokens <= 0) continue;

            addAggregate(byState[session.state] || byState.active, totals, session.turns);
            addAggregate(total, totals, session.turns);
            addAggregate(session.parent ? subagentTotals : rootTotals, totals, session.turns);

            timing.toolCalls += session.toolCalls || 0;
            timing.toolsMs += session.toolsMs || 0;
            timing.modelCalls += session.modelCalls || 0;
            timing.wallMs += session.wallMs || 0;
            timing.ttftMs += session.ttftMs || 0;
            timing.reasoningMs += session.reasoningMs || 0;
            timing.textMs += session.textMs || 0;
            timing.toolArgMs += session.toolArgMs || 0;
            if ((session.cost || 0) > 0) priced += 1;

            if (session.composition) {
              compose.system += session.composition.system || 0;
              compose.tools += session.composition.tools || 0;
              compose.user += session.composition.user || 0;
              compose.inject += session.composition.inject || 0;
              compose.skill += session.composition.skill || 0;
              compose.assistant += session.composition.assistant || 0;
              compose.tool += session.composition.tool || 0;
            } else {
              compose.other += totals.tokens;
            }

            var skillList = Array.isArray(session.skills) ? session.skills : [];
            for (var sIdx = 0; sIdx < skillList.length; sIdx += 1) {
              var skill = skillList[sIdx];
              if (typeof skill.name !== "string" || skill.name === "") continue;
              var bucket = skillMap[skill.name] || { name: skill.name, count: 0, tokens: 0, lastAt: 0 };
              bucket.count += skill.count || 0;
              bucket.tokens += skill.tokens || 0;
              bucket.lastAt = Math.max(bucket.lastAt, skill.lastAt || 0);
              skillMap[skill.name] = bucket;
            }

          }

          var skills = Object.keys(skillMap)
            .map(function (name) {
              return skillMap[name];
            })
            .sort(function (left, right) {
              return right.count - left.count || right.lastAt - left.lastAt;
            });

          var current = emptyAggregate();
          current.input = byState.active.input + byState.archived.input;
          current.cacheRead = byState.active.cacheRead + byState.archived.cacheRead;
          current.cacheWrite = byState.active.cacheWrite + byState.archived.cacheWrite;
          current.output = byState.active.output + byState.archived.output;
          current.tokens = byState.active.tokens + byState.archived.tokens;
          current.cost = byState.active.cost + byState.archived.cost;
          current.turns = byState.active.turns + byState.archived.turns;
          current.sessions = byState.active.sessions + byState.archived.sessions;

          var series = keys.map(function (key) {
            return {
              key: key,
              alive: buckets[key].alive,
              deleted: buckets[key].deleted,
              tokens: buckets[key].tokens,
              cost: buckets[key].cost,
            };
          });

          return {
            rows: rows,
            byState: byState,
            current: current,
            total: total,
            rootTotals: rootTotals,
            subagents: subagentTotals,
            compose: compose,
            skills: skills,
            timing: timing,
            priced: priced,
            heat: series,
            chart: series.slice(series.length - 7),
          };
        },
        [data, range, depth],
      );

      var filtered = useMemo(
        function () {
          if (derived === null) return [];
          var needle = query.trim().toLowerCase();
          return derived.rows.filter(function (row) {
            // Forgotten sessions never get their own card; they are one
            // aggregate item inside the deleted list.
            if (row.state === "forgotten") return false;
            if (scope !== "all" && row.state !== scope) return false;
            if (needle === "") return true;
            return row.haystack.indexOf(needle) !== -1;
          }).sort(function (left, right) {
            if (sort === "tokens") return right.totals.tokens - left.totals.tokens || right.lastSeenAt - left.lastSeenAt;
            if (sort === "cost") return right.totals.cost - left.totals.cost || right.lastSeenAt - left.lastSeenAt;
            if (sort === "turns") return right.turns - left.turns || right.lastSeenAt - left.lastSeenAt;
            return right.lastSeenAt - left.lastSeenAt;
          });
        },
        [derived, scope, query, sort],
      );

      var head = h(
        "div",
        { className: "dul_head" },
        h(
          "div",
          { className: "dul_titles" },
          h("h1", { className: "dul_title" }, t("page.title")),
        ),
        h(
          "div",
          { className: "dul_tools" },
          h(
            "button",
            {
              type: "button",
              className: "dul_btn",
              onClick: function () {
                if (typeof props.onOpenSettings === "function") props.onOpenSettings();
              },
            },
            t("header.settings"),
          ),
          data !== null && data.balance !== null && data.balance !== undefined
            ? h(
                "span",
                { className: "dul_pill" },
                t("header.balance"),
                " ",
                (data.balance.currency === "CNY" ? "¥" : "$") + data.balance.amount,
              )
            : null,
          h(Segmented, {
            value: range,
            label: t("range.label"),
            onChange: setRange,
            options: [
              { value: "all", label: t("range.all") },
              { value: "30d", label: t("range.d30") },
              { value: "7d", label: t("range.d7") },
            ],
          }),
          h(
            "button",
            { type: "button", className: "dul_btn", disabled: loading || busy, onClick: function () { load(true); } },
            loading ? t("loading") : t("refresh"),
          ),
        ),
      );

      if (phase === "loading") {
        return h("div", { className: "dul_page" + (dense ? " dul_dense" : "") }, h("div", { className: "dul_inner" }, head, h("div", { className: "dul_empty" }, t("loading"))));
      }
      if (phase === "error") {
        return h(
          "div",
          { className: "dul_page" + (dense ? " dul_dense" : "") },
          h("div", { className: "dul_inner" }, head, h("p", { className: "dul_error" }, t("error.load") + " " + error)),
        );
      }

      var composition = [
        { key: "system", label: t("compose.system"), value: derived.compose.system, text: formatTokens(derived.compose.system, t) },
        { key: "tools", label: t("compose.tools"), value: derived.compose.tools, text: formatTokens(derived.compose.tools, t) },
        { key: "user", label: t("compose.user"), value: derived.compose.user, text: formatTokens(derived.compose.user, t) },
        { key: "inject", label: t("compose.inject"), value: derived.compose.inject, text: formatTokens(derived.compose.inject, t) },
        { key: "skill", label: t("compose.skill"), value: derived.compose.skill, text: formatTokens(derived.compose.skill, t) },
        { key: "assistant", label: t("compose.assistant"), value: derived.compose.assistant, text: formatTokens(derived.compose.assistant, t) },
        { key: "tool", label: t("compose.tool"), value: derived.compose.tool, text: formatTokens(derived.compose.tool, t) },
      ];
      if (derived.compose.other > 0) {
        composition.push({
          key: "other",
          label: t("compose.other"),
          value: derived.compose.other,
          text: formatTokens(derived.compose.other, t),
        });
      }
      var composeTotal = 0;
      for (var ci = 0; ci < composition.length; ci += 1) composeTotal += composition[ci].value;

      var spent = derived.timing;
      var timeCenter = durationCenter(spent.wallMs, t);
      var accounted = spent.ttftMs + spent.reasoningMs + spent.textMs + spent.toolArgMs + spent.toolsMs;
      var otherMs = Math.max(0, spent.wallMs - accounted);
      var modelTimes = spent.modelCalls + " " + t("unit.times");
      var toolTimes = spent.toolCalls + " " + t("unit.times");
      var timeRows = [
        { key: "wait", label: t("timec.wait"), value: spent.ttftMs, text: formatDuration(spent.ttftMs, t) + " · " + modelTimes },
        { key: "reasoning", label: t("timec.reasoning"), value: spent.reasoningMs, text: formatDuration(spent.reasoningMs, t) + " · " + modelTimes },
        { key: "reply", label: t("timec.reply"), value: spent.textMs, text: formatDuration(spent.textMs, t) + " · " + modelTimes },
        { key: "toolArg", label: t("timec.toolArg"), value: spent.toolArgMs, text: formatDuration(spent.toolArgMs, t) + " · " + toolTimes },
        { key: "toolExec", label: t("timec.toolExec"), value: spent.toolsMs, text: formatDuration(spent.toolsMs, t) + " · " + toolTimes },
        { key: "other", label: t("timec.other"), value: otherMs, text: formatDuration(otherMs, t) },
      ];


      function selectDay(key) { showDetail({ kind: "day", key: key }); }
      function selectSkill(key) { showDetail({ kind: "skill", key: key }); }
      function breakdown(kind, title, rows, hover, onHover) {
        function select(row) { showDetail({ kind: kind, key: row.key }); }
        return h("section", { className: "dul_card dul_compositionCard", "aria-label": title },
          h("div", { className: "dul_cardHead" }, h("span", { className: "dul_cardTitle" }, title)),
          h("div", { className: "dul_donutRow" },
            h(Donut, { size: 72, stroke: 9, slices: rows, highlight: hover, onHover: onHover, onSelect: select,
              centerValue: kind === "timing" ? timeCenter.value : formatTokens(composeTotal, t),
              centerLabel: kind === "timing" ? timeCenter.unit : t("donut.total"),
              centerTitle: kind === "timing" ? t("timec.active") + " · " + formatDuration(spent.wallMs, t) : undefined }),
            h(CompositionLegend, { rows: rows, hover: hover, onHover: onHover, onSelect: select })));
      }
      var pages = Math.max(1, Math.ceil(filtered.length / pageSize));
      var currentPage = Math.min(page, pages - 1);
      var visibleRows = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
      var counts = { all: 0, active: 0, archived: 0, deleted: 0 };
      derived.rows.forEach(function (row) { if (row.state !== "forgotten") { counts.all += 1; if (counts[row.state] !== undefined) counts[row.state] += 1; } });
      var aggregate = query.trim() === "" && (scope === "all" || scope === "deleted") && derived.byState.forgotten.sessions > 0 ? derived.byState.forgotten : null;
      var sessionProps = {
        rows: visibleRows, t: t, canManage: data.canDelete === true && data.canArchive === true,
        busy: busy, rate: data.usdToCny, onAsk: ask, onOpen: props.onOpenSession,
        onUnarchive: function (id) { act(id, "/unarchive"); },
      };
      function selectTab(value) { detailReturn.current = null; setDetail(null); setTab(value); }
      function tabKey(event, value) {
        var target;
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") target = value === "overview" ? "sessions" : "overview";
        else if (event.key === "Home") target = "overview";
        else if (event.key === "End") target = "sessions";
        else return;
        event.preventDefault();
        selectTab(target);
        var next = event.currentTarget.parentElement.querySelector('[data-ledger-tab="' + target + '"]');
        if (next) next.focus();
      }
      return h("div", { ref: pageRoot, className: "dul_page" + (dense ? " dul_dense" : "") },
        h("div", { className: "dul_inner" }, head,
          error ? h("p", { className: "dul_error dul_refreshError", role: "alert" }, t("error.load") + " " + error) : null,
          h("div", { className: "dul_navigation" },
            h("div", { className: "dul_tabs", role: "tablist", "aria-label": t("nav.label") }, ["overview", "sessions"].map(function (value) {
              return h("button", { key: value, id: NS + "-tab-" + value, type: "button", role: "tab", className: "dul_tab", "data-ledger-tab": value, "aria-selected": tab === value, "aria-controls": NS + "-panel-" + value, tabIndex: tab === value ? 0 : -1,
                onClick: function () { selectTab(value); }, onKeyDown: function (event) { tabKey(event, value); } }, t("nav." + value));
            })),
            h("a", { className: "dul_reference", href: REFERENCE_URL, target: "_blank", rel: "noopener noreferrer", title: "bowenliang123/dsh-context" }, t("source.reference"))),
          h("div", { className: "dul_panel", role: "tabpanel", id: NS + "-panel-overview", "aria-labelledby": NS + "-tab-overview", hidden: tab !== "overview" },
          detail !== null ? h(DetailPanel, { selection: detail, t: t, sessions: data.sessions || [], skills: derived.skills, range: range, rate: data.usdToCny, onClose: function () { setDetail(null); }, onSkill: selectSkill, onOpen: props.onOpenSession }) : null,
          h("div", { className: "dul_overviewContent", hidden: detail !== null },
          h("section", { className: "dul_top", "aria-label": t("overview.title") },
            h(Kpi, { label: t("kpi.sessions"), value: String(derived.total.sessions), hint: t("kpi.sessionsBreak", { a: derived.byState.active.sessions, b: derived.byState.archived.sessions, d: derived.byState.deleted.sessions }) }),
            h(Kpi, { label: t("kpi.tokens"), value: formatTokens(derived.total.tokens, t), hint: t("kpi.tokenBreak", { session: formatTokens(derived.rootTotals.tokens, t), sub: formatTokens(derived.subagents.tokens, t), turns: derived.total.turns }) }),
            h(Kpi, { label: t("kpi.cost"), value: formatCost(derived.total.cost, data.usdToCny, t), hint: t("kpi.costBreak", { session: formatCost(derived.rootTotals.cost, data.usdToCny, t), sub: formatCost(derived.subagents.cost, data.usdToCny, t) }) }),
            h(Kpi, { label: t("kpi.cache"), value: derived.total.input + derived.total.cacheRead > 0 ? formatPercent(cacheHitOf(derived.total)) : "—", hint: t("kpi.cacheHint") }),
            h(Kpi, { label: t("kpi.tools"), value: String(derived.timing.toolCalls), hint: t("kpi.toolsHint", { d: formatDuration(derived.timing.toolsMs, t) }) }),
            h(Kpi, { label: t("kpi.activeTime"), value: formatDuration(derived.timing.wallMs, t), hint: t("kpi.modelHint", { n: derived.timing.modelCalls }) })),
          h("div", { className: "dul_analysis" },
            h(DailyChart, { t: t, cardClass: "dul_chartCard", rate: data.usdToCny, title: t("chart.title"), empty: t("chart.empty"), series: derived.chart, onSelect: selectDay }),
            breakdown("composition", t("compose.title"), composition, hoverSlice, setHoverSlice),
            breakdown("timing", t("timec.title"), timeRows, hoverTime, setHoverTime),
            h(Heatmap, { t: t, cardClass: "dul_heatCard", title: t("heat.title"), less: t("heat.less"), more: t("heat.more"), series: derived.heat, onSelect: selectDay }),
            h("section", { className: "dul_card dul_skillCard", "aria-label": t("skill.title") },
              h("div", { className: "dul_cardHead" }, h("span", { className: "dul_cardTitle" }, t("skill.title")),
                derived.skills.length > 6 ? h("button", { type: "button", className: "dul_link", onClick: function () { showDetail({ kind: "skills" }); } }, t("detail.allSkills", { n: derived.skills.length })) : null),
              h(SkillList, { skills: derived.skills.slice(0, 6), t: t, onSelect: selectSkill }))))),
          h("div", { className: "dul_panel", role: "tabpanel", id: NS + "-panel-sessions", "aria-labelledby": NS + "-tab-sessions", hidden: tab !== "sessions" },
          h("section", { className: "dul_card dul_sessions", "aria-label": t("sessions.title"), "aria-busy": busy || loading },
            h("div", { className: "dul_sessionsHead" }, h("h2", { className: "dul_sessionsTitle" }, t("sessions.title")),
              h("div", { className: "dul_sessionTools" },
                h(Segmented, { value: depth, onChange: setDepth, label: t("depth.label"), options: [{ value: "root", label: t("depth.root") }, { value: "all", label: t("depth.all") }] }),
                h(Segmented, { value: view, onChange: setView, label: t("view.label"), options: [{ value: "list", label: t("view.list") }, { value: "cards", label: t("view.cards") }] }))),
            h("div", { className: "dul_filters" },
              h(Segmented, { value: scope, onChange: setScope, label: t("filter.label"), options: ["all", "active", "archived", "deleted"].map(function (value) { return { value: value, label: t("filter." + value) + " " + counts[value] }; }) }),
              h("input", { className: "dul_search", type: "search", value: query, placeholder: t("search.placeholder"), "aria-label": t("search.placeholder"), onChange: function (event) { setQuery(event.target.value); } }),
              h("select", { className: "dul_select", value: sort, "aria-label": t("sort.label"), onChange: function (event) { setSort(event.target.value); } }, ["recent", "tokens", "cost", "turns"].map(function (key) { return h("option", { key: key, value: key }, t("sort." + key)); })),
              query || scope !== "all" || sort !== "recent" ? h("button", { type: "button", className: "dul_btn", onClick: function () { setQuery(""); setScope("all"); setSort("recent"); } }, t("filter.reset")) : null),
            notice ? h("p", { className: "dul_notice " + (noticeError ? "dul_noticeError" : "dul_noticeSuccess"), role: noticeError ? "alert" : "status" }, notice) : null,
            dense ? h(SessionTable, sessionProps) : h(SessionCards, sessionProps),
            aggregate ? h("div", { className: "dul_forgotten" }, t("forgotten.summary", { n: aggregate.sessions, tokens: formatTokens(aggregate.tokens, t), cost: formatCost(aggregate.cost, data.usdToCny, t) })) : null,
            h("div", { className: "dul_resultStatus" }, h("span", { className: "dul_pageResults", "aria-live": "polite" }, t("list.pageResults", { from: filtered.length ? currentPage * pageSize + 1 : 0, to: Math.min((currentPage + 1) * pageSize, filtered.length), total: filtered.length })),
              h("nav", { className: "dul_pager", "aria-label": t("page.navigation") },
                h("select", { className: "dul_select", "aria-label": t("page.size"), value: perPage, onChange: function (event) { setPerPage(event.target.value); } },
                  h("option", { value: "auto" }, t("page.auto", { n: dense ? 25 : 9 })),
                  ["12", "24", "48"].map(function (size) { return h("option", { key: size, value: size }, t("page.items", { n: size })); })),
                h("button", { type: "button", className: "dul_btn", disabled: currentPage === 0, onClick: function () { setPage(currentPage - 1); } }, t("page.previous")),
                h("span", { className: "dul_pageNumber" }, h("select", { className: "dul_select", "aria-label": t("page.jump"), value: String(currentPage), onChange: function (event) { setPage(Number(event.target.value)); } },
                  Array.from({ length: pages }, function (_, index) { return h("option", { key: index, value: String(index) }, String(index + 1)); })), " / " + pages),
                h("button", { type: "button", className: "dul_btn", disabled: currentPage + 1 === pages, onClick: function () { setPage(currentPage + 1); } }, t("page.next"))))))),
        confirm !== null ? h(ConfirmDialog, { t: t, busy: busy, error: dialogError, danger: confirm.kind === "delete", title: t("dialog." + confirm.kind + ".title"), message: t("dialog." + confirm.kind + ".body", { name: confirm.name }), confirmLabel: t("dialog." + confirm.kind + ".confirm"), onConfirm: confirmRun, onCancel: function () { setConfirm(null); setDialogError(""); } }) : null);
    }

    // ---------------------------------------------------------------------
    // Dictionaries
    // ---------------------------------------------------------------------

    var zh = {
      "nav.label": "账本页面",
      "nav.overview": "概览",
      "nav.sessions": "会话明细",
      "source.reference": "参考 dsh-context",
      "page.navigation": "会话分页",
      "page.size": "每页数量",
      "page.auto": "自动 · {n} 条/页",
      "page.items": "{n} 条/页",
      "page.jump": "跳转页码",
      "list.pageResults": "显示 {from}–{to} 项，共 {total} 个会话",
      "overview.title": "用量概览",
      "sessions.title": "会话明细",
      "range.label": "统计范围",
      "depth.label": "子代理统计",
      "view.label": "显示方式",
      "view.list": "列表",
      "view.cards": "卡片",
      "filter.label": "会话状态",
      "filter.reset": "清除筛选",
      "sort.label": "会话排序",
      "sort.recent": "最近活跃",
      "sort.tokens": "Token 最多",
      "sort.cost": "费用最高",
      "sort.turns": "轮次最多",
      "table.cost": "预估费用",
      "table.actions": "操作",
      "action.menu": "操作",
      "action.working": "处理中…",
      "action.done.archive": "会话已归档，用量已保留。",
      "action.done.unarchive": "已取消归档。",
      "action.done.delete": "会话已删除，账本用量已保留。",
      "action.done.forget": "已从列表收起，用量仍计入合计。",
      "list.results": "{shown} / {total} 个会话",
      "page.previous": "上一页",
      "page.next": "下一页",
      "detail.close": "关闭",
      "detail.day": "{date} · 每日用量",
      "detail.skill": "技能加载 · {name}",
      "detail.sessions": "{n} 个相关会话",
      "detail.skillTokens": "技能注入 Token",
      "detail.dayHint": "当日本地日期的用量，包含已归档和已删除会话。",
      "detail.cumulative": "所选范围内有用量会话的累计记录，包含子代理。",
      "detail.empty": "没有找到相关用量记录。",
      "detail.allSkills": "查看全部 {n} 项",
      "number.system": "zh",
      "panel.label": "用量账本",
      "page.title": "用量账本",
      "page.subtitle": "未归档、已归档、已删除三种状态的 Token 用量，子代理已并入所属会话",
      "range.all": "全部",
      "range.d30": "近 30 天",
      "range.d7": "近 7 天",
      "header.settings": "插件设置",
      "header.balance": "DeepSeek 余额",
      "density.compact": "紧凑",
      "density.comfortable": "宽松",
      "depth.root": "仅主会话",
      "depth.all": "合并子代理",
      "kpi.current": "当前合计",
      "kpi.currentHint": "{n} 个会话 · 未归档 + 已归档",
      "kpi.deleted": "已删除",
      "kpi.archived": "已归档",
      "kpi.active": "未归档",
      "kpi.total": "总计",
      "kpi.cost": "预估费用",
      "kpi.costHint": "模型牌价 + 峰谷折扣估算",
      "kpi.costHint2": "已计价 {n}/{m} 个会话",
      "kpi.sessions": "会话",
      "kpi.sessionsBreak": "未归档 {a} · 已归档 {b} · 已删除 {d}",
      "kpi.tokens": "Token 消耗",
      "kpi.tokenBreak": "会话 {session} · 子代理 {sub} · {turns} 轮",
      "kpi.costBreak": "会话 {session} · 子代理 {sub}",
      "kpi.tools": "工具调用",
      "kpi.toolsHint": "工具执行 {d}",
      "kpi.activeTime": "活跃时长",
      "kpi.modelHint": "模型调用 {n}",
      "dur.hm": "{h} 小时 {m} 分",
      "dur.ms": "{m} 分 {s} 秒",
      "dur.s": "{s} 秒",
      "dur.unit.h": "小时",
      "dur.unit.m": "分钟",
      "dur.unit.s": "秒",
      "detail.total": "合计",
      "detail.back": "返回概览",
      "kpi.sessionsHint": "{n} 个会话",
      "kpi.turnsHint": "共 {n} 轮",
      "kpi.totalHintSub": "共 {n} 轮 · 子代理另 {sub}",
      "kpi.cache": "缓存命中",
      "kpi.cacheHint": "缓存读 / 全部输入",
      "chart.title": "近 7 天每日用量",
      "chart.hint": "每根柱 = 当天全部会话的计费 Token",
      "chart.hintShort": "含已删除会话",
      "chart.sum": "总计",
      "chart.alive": "现存会话",
      "chart.deleted": "已删除会话",
      "chart.peak": "峰值",
      "tip.tokens": "Token",
      "tip.cost": "费用",
      "chart.empty": "还没有可画的数据",
      "compose.title": "Token 构成",
      "compose.hint": "按内容分类",
      "compose.system": "系统提示词",
      "compose.tools": "工具定义",
      "compose.user": "用户消息",
      "compose.inject": "注入内容",
      "compose.skill": "技能注入",
      "compose.assistant": "助手消息",
      "compose.tool": "工具结果",
      "compose.other": "未分类",
      "skill.title": "技能加载",
      "skill.empty": "还没有技能记录",
      "states.title": "状态构成",
      "states.hint": "按 Token 计",
      "timec.title": "耗时构成",
      "timec.hint": "活跃时长按阶段拆分",
      "timec.wait": "模型等待",
      "timec.reasoning": "模型思考",
      "timec.reply": "模型回复",
      "timec.toolArg": "工具参数",
      "timec.toolExec": "工具执行",
      "timec.other": "其他开销",
      "timec.active": "活跃时长",
      "unit.times": "次",
      "donut.total": "Token",
      "donut.sessions": "会话",
      "heat.title": "活跃度",
      "heat.hint": "近 8 周每日用量",
      "heat.less": "少",
      "heat.more": "多",
      "filter.all": "全部",
      "filter.active": "未归档",
      "filter.archived": "已归档",
      "filter.deleted": "已删除",
      "search.placeholder": "搜索标题 / 路径 / 模型",
      "rows.count": "{n} 行",
      "table.session": "会话",
      "table.model": "模型",
      "table.tokens": "Token 数",
      "table.cache": "缓存",
      "table.turns": "轮次",
      "table.last": "最后活跃",
      "table.state": "状态",
      "state.active": "未归档",
      "state.archived": "已归档",
      "state.deleted": "已删除",
      "state.forgotten": "不再记录",
      "status.subagent": "子代理",
      "group.subagents": "含 {n} 个子代理",
      "group.subagentsDeleted": "含 {n} 个子代理 · {m} 已删除",
      "group.orphanTitle": "父会话未记录",
      "group.orphanId": "父会话 {id}…",
      "untitled": "未命名会话",
      "empty.filtered": "没有符合筛选条件的会话",
      "error.load": "读取账本失败：",
      "refresh": "刷新",
      "loading": "读取中…",
      "delete.action": "删除",
      "delete.confirm": "确认删除",
      "delete.cancel": "取消",
      "archive.action": "归档",
      "unarchive.action": "取消归档",
      "forget.action": "不再记录",
      "forgotten.title": "不再记录",
      "forgotten.count": "{n} 个会话",
      "forgotten.hint": "已收起的已删除会话",
      "filter.forgotten": "不再记录",
      "forgotten.summary": "不再记录：{n} 个会话 · {tokens} Token · {cost}",
      "dialog.forget.title": "不再记录这个会话？",
      "dialog.forget.body": "「{name}」会从列表里收起，只保留在「不再记录」的合计里；它的用量仍然计入总计。",
      "dialog.forget.confirm": "不再记录",
      "card.open": "点击打开这个会话",
      "dialog.archive.title": "归档这个会话？",
      "dialog.archive.body": "「{name}」会移出会话列表，放进归档区；账本里的用量不受影响。",
      "dialog.archive.confirm": "归档",
      "dialog.delete.title": "删除这个会话？",
      "dialog.delete.body": "「{name}」的会话日志会移入插件回收站（默认保留 30 天），账本里的用量保留。",
      "dialog.delete.confirm": "删除",
      "delete.error.already-archived": "该会话已经归档了。",
      "delete.error.registry-failed": "操作失败：工作区注册表拒绝了请求。",
      "deleting": "删除中…",
      "delete.error.not-archived": "该会话已不在归档列表中，未删除。",
      "delete.error.session-running": "会话正在运行，无法归档或删除。",
      "delete.error.subagent-running": "它的子代理还在运行，无法归档或删除。",
      "delete.error.no-registry": "工作区注册表不可用，已拒绝删除。",
      "delete.error.not-tracked": "账本里没有这个会话，未删除。",
      "delete.error.already-deleted": "该会话已经删除了。",
      "delete.error.busy": "另一个删除正在进行，请稍后。",
      "delete.error.invalid-session-id": "会话标识不合法。",
      "delete.error.park-failed": "删除失败：无法移走会话日志，已回滚。",
      "delete.error.forbidden": "请求被拒绝。",
      "delete.error.generic": "操作失败，详情见运行日志。",
      "time.now": "刚刚",
      "time.minutes": "{n} 分钟前",
      "time.hours": "{n} 小时前",
      "time.days": "{n} 天前",
    };

    var en = {
      "nav.label": "Ledger pages",
      "nav.overview": "Overview",
      "nav.sessions": "Sessions",
      "source.reference": "Inspired by dsh-context",
      "page.navigation": "Session pagination",
      "page.size": "Items per page",
      "page.auto": "Auto · {n} / page",
      "page.items": "{n} / page",
      "page.jump": "Go to page",
      "list.pageResults": "Showing {from}–{to} of {total} sessions",
      "overview.title": "Usage overview",
      "sessions.title": "Sessions",
      "range.label": "Usage period",
      "depth.label": "Subagent totals",
      "view.label": "View",
      "view.list": "List",
      "view.cards": "Cards",
      "filter.label": "Session state",
      "filter.reset": "Clear filters",
      "sort.label": "Sort sessions",
      "sort.recent": "Recently active",
      "sort.tokens": "Most tokens",
      "sort.cost": "Highest cost",
      "sort.turns": "Most turns",
      "table.cost": "Est. cost",
      "table.actions": "Actions",
      "action.menu": "Actions",
      "action.working": "Working…",
      "action.done.archive": "Session archived. Its usage is retained.",
      "action.done.unarchive": "Session unarchived.",
      "action.done.delete": "Session deleted. Ledger usage is retained.",
      "action.done.forget": "Session hidden. Its usage still counts in totals.",
      "list.results": "{shown} / {total} sessions",
      "page.previous": "Previous",
      "page.next": "Next",
      "detail.close": "Close",
      "detail.day": "{date} · Daily usage",
      "detail.skill": "Skill loads · {name}",
      "detail.sessions": "{n} related sessions",
      "detail.skillTokens": "skill-injection tokens",
      "detail.dayHint": "Usage on this local date, including archived and deleted sessions.",
      "detail.cumulative": "Cumulative records for sessions with usage in the selected period, including subagents.",
      "detail.empty": "No related usage records.",
      "detail.allSkills": "View all {n}",
      "number.system": "en",
      "panel.label": "Usage ledger",
      "page.title": "Usage ledger",
      "page.subtitle": "Tokens for active, archived, and deleted sessions, with subagents folded in",
      "range.all": "All",
      "range.d30": "Last 30 days",
      "range.d7": "Last 7 days",
      "header.settings": "Plugin settings",
      "header.balance": "DeepSeek balance",
      "density.compact": "Compact",
      "density.comfortable": "Comfortable",
      "depth.root": "Main only",
      "depth.all": "Include subagents",
      "kpi.current": "Current",
      "kpi.currentHint": "{n} sessions · active + archived",
      "kpi.deleted": "Deleted",
      "kpi.archived": "Archived",
      "kpi.active": "Active",
      "kpi.total": "Total",
      "kpi.cost": "Est. cost",
      "kpi.costHint": "List price with peak/off-peak discount",
      "kpi.costHint2": "{n}/{m} sessions priced",
      "kpi.sessions": "Sessions",
      "kpi.sessionsBreak": "active {a} · archived {b} · deleted {d}",
      "kpi.tokens": "Tokens",
      "kpi.tokenBreak": "sessions {session} · subagents {sub} · {turns} turns",
      "kpi.costBreak": "sessions {session} · subagents {sub}",
      "kpi.tools": "Tool calls",
      "kpi.toolsHint": "{d} in tools",
      "kpi.activeTime": "Active time",
      "kpi.modelHint": "{n} model calls",
      "dur.hm": "{h}h {m}m",
      "dur.ms": "{m}m {s}s",
      "dur.s": "{s}s",
      "dur.unit.h": "hours",
      "dur.unit.m": "min",
      "dur.unit.s": "sec",
      "detail.total": "Total",
      "detail.back": "Back to overview",
      "kpi.sessionsHint": "{n} sessions",
      "kpi.turnsHint": "{n} turns",
      "kpi.totalHintSub": "{n} turns · subagents {sub}",
      "kpi.cache": "Cache hit",
      "kpi.cacheHint": "Cache read / all input",
      "chart.title": "Daily usage, last 7 days",
      "chart.hint": "Each day: tokens from live sessions and from deleted ones",
      "chart.hintShort": "Deleted included",
      "chart.sum": "Total",
      "chart.alive": "Live sessions",
      "chart.deleted": "Deleted sessions",
      "chart.peak": "Peak",
      "tip.tokens": "Tokens",
      "tip.cost": "Cost",
      "chart.empty": "Nothing to chart yet",
      "compose.title": "Token composition",
      "compose.hint": "By content category",
      "compose.system": "System prompt",
      "compose.tools": "Tool schemas",
      "compose.user": "User messages",
      "compose.inject": "Injected context",
      "compose.skill": "Skill injections",
      "compose.assistant": "Assistant replies",
      "compose.tool": "Tool results",
      "compose.other": "Unclassified",
      "skill.title": "Skill loads",
      "skill.empty": "No skill recorded yet",
      "states.title": "State composition",
      "states.hint": "By tokens",
      "timec.title": "Time composition",
      "timec.hint": "Active time by phase",
      "timec.wait": "Model wait",
      "timec.reasoning": "Reasoning",
      "timec.reply": "Reply",
      "timec.toolArg": "Tool arguments",
      "timec.toolExec": "Tool runs",
      "timec.other": "Other",
      "timec.active": "Active time",
      "unit.times": "times",
      "donut.total": "tokens",
      "donut.sessions": "sessions",
      "heat.title": "Activity",
      "heat.hint": "Daily tokens, last 8 weeks",
      "heat.less": "Less",
      "heat.more": "More",
      "filter.all": "All",
      "filter.active": "Active",
      "filter.archived": "Archived",
      "filter.deleted": "Deleted",
      "search.placeholder": "Search title, path, or model",
      "rows.count": "{n} rows",
      "table.session": "Session",
      "table.model": "Model",
      "table.tokens": "Tokens",
      "table.cache": "Cache",
      "table.turns": "Turns",
      "table.last": "Last active",
      "table.state": "State",
      "state.active": "Active",
      "state.archived": "Archived",
      "state.deleted": "Deleted",
      "state.forgotten": "Not listed",
      "status.subagent": "Subagent",
      "group.subagents": "{n} subagents",
      "group.subagentsDeleted": "{n} subagents · {m} deleted",
      "group.orphanTitle": "Parent not recorded",
      "group.orphanId": "Parent {id}…",
      "untitled": "Untitled session",
      "empty.filtered": "No session matches this filter",
      "error.load": "Could not read the ledger:",
      "refresh": "Refresh",
      "loading": "Loading…",
      "delete.action": "Delete",
      "delete.confirm": "Confirm",
      "delete.cancel": "Cancel",
      "archive.action": "Archive",
      "unarchive.action": "Unarchive",
      "forget.action": "Stop listing",
      "forgotten.title": "Not listed",
      "forgotten.count": "{n} sessions",
      "forgotten.hint": "Deleted sessions collapsed into this total",
      "filter.forgotten": "Hidden",
      "forgotten.summary": "Not listed: {n} sessions · {tokens} tokens · {cost}",
      "dialog.forget.title": "Stop listing this session?",
      "dialog.forget.body": "“{name}” collapses into the “not listed” total; its usage still counts everywhere else.",
      "dialog.forget.confirm": "Stop listing",
      "card.open": "Open this session",
      "dialog.archive.title": "Archive this session?",
      "dialog.archive.body": "“{name}” leaves the session list and moves to the archive. Its ledger entries are unaffected.",
      "dialog.archive.confirm": "Archive",
      "dialog.delete.title": "Delete this session?",
      "dialog.delete.body": "The log of “{name}” moves to the plugin's recycle bin (kept 30 days by default); its ledger entries stay.",
      "dialog.delete.confirm": "Delete",
      "delete.error.already-archived": "That session is already archived.",
      "delete.error.registry-failed": "The workspace registry rejected the operation.",
      "deleting": "Deleting…",
      "delete.error.not-archived": "That session is no longer archived; nothing was deleted.",
      "delete.error.session-running": "Session is running; not deleted.",
      "delete.error.subagent-running": "A subagent is still running; not deleted.",
      "delete.error.no-registry": "Workspace registry unavailable; deletion refused.",
      "delete.error.not-tracked": "This session is not in the ledger; nothing was deleted.",
      "delete.error.already-deleted": "That session is already deleted.",
      "delete.error.busy": "Another deletion is in progress.",
      "delete.error.invalid-session-id": "Invalid session id.",
      "delete.error.park-failed": "Deletion failed: the session log could not be moved; rolled back.",
      "delete.error.forbidden": "Request rejected.",
      "delete.error.generic": "Operation failed — check the run log.",
      "time.now": "just now",
      "time.minutes": "{n} min ago",
      "time.hours": "{n} h ago",
      "time.days": "{n} d ago",
    };

    var inject = ["slots", "locale", "uiWorkspace", "layout"];

    function apply(ctx) {
      ctx.effect(
        function () {
          var tag = injectStyle();
          return function () {
            if (tag !== null && tag.parentNode) tag.parentNode.removeChild(tag);
          };
        },
        "dsh-usage-ledger: styles",
      );
      ctx.effect(
        function () {
          return ctx.locale.register(NS, { zh: zh, en: en });
        },
        "dsh-usage-ledger: dictionaries",
      );
      var t = ctx.locale.bind(NS);

      ctx.slots.inject("sidebar.panellist", function () {
        return ctx.slots.register(
          {
            name: "sidebar.panellist",
            id: "usage-ledger",
            order: 30,
            locale: NS,
            label: function () {
              return t("panel.label");
            },
          },
          PanelIcon,
        );
      });

      ctx.slots.inject("main", function () {
        return ctx.slots.register({ name: "main", key: "usage-ledger" }, function (props) {
          return h(
            LedgerPage,
            Object.assign({}, props, {
              t: t,
              onOpenSession: function (sessionId) {
                try {
                  ctx.uiWorkspace.openSession(sessionId);
                } catch (error) {
                  // An id this client cannot address simply does not navigate.
                }
              },
              onOpenSettings: function () {
                try {
                  ctx.layout.selectPanel("plugins");
                } catch (error) {
                  // A host without the panel simply does not navigate.
                }
              },
            }),
          );
        });
      });
    }

    return {
      inject: inject,
      apply: apply,
      __test: { groupSessions: groupSessions, normalizeId: normalizeId, detailRows: detailRows },
    };
  },
});
