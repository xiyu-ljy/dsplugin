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

window.__ModuleLoader__.load({
  id: "dsh-usage-ledger",
  factory: (require) => {
    var React = require("react");
    var h = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useMemo = React.useMemo;

    var NS = "dsh-usage-ledger";
    var BASE = "/api/usage-ledger";
    var HEADER = "x-dsh-usage-ledger";
    var STYLE_ID = "dsh-usage-ledger-style";

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
      ".dul_donutValue{font-size:13px;line-height:17px;font-weight:600;font-variant-numeric:tabular-nums}",
      ".dul_donutLabel{font-size:9px;line-height:13px;color:var(--dsw-alias-label-secondary)}",
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
        { className: "dul_seg", role: "group" },
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
        props.hint ? h("span", { className: "dul_kpiHint" }, props.hint) : null,
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
        { className: "dul_donut", style: { width: size + "px", height: size + "px" } },
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
            "div",
            {
              className: "dul_clegendItem" + (props.hover === position ? " dul_clegendItemOn" : ""),
              key: row.key,
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
     * Two bars per day: tokens from sessions that still exist (blue) and from
     * sessions that were deleted (green). Both are tokens, one axis — no money
     * figure is invented without a price source.
     */
    function DailyChart(props) {
      var t = props.t;
      var rate = props.rate || 7.2;
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
          "div",
          {
            key: point.key,
            className: "dul_dayGroup" + (hover === position ? " dul_dayGroupOn" : ""),
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
                    ? h("span", { style: { color: PALETTE[1] } }, "¥" + ((point.cost || 0) * rate).toFixed(2))
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
                h("span", null, "¥" + maxCost.toFixed(2)),
                h("span", null, "¥" + (maxCost * 0.75).toFixed(2)),
                h("span", null, "¥" + (maxCost / 2).toFixed(2)),
                h("span", null, "¥" + (maxCost * 0.25).toFixed(2)),
                h("span", null, "¥0"),
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
            h("div", {
              key: cell.key,
              className: "dul_cell",
              title: cell.key + " · " + formatTokens(cell.tokens, t),
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
        { className: "dul_card" },
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
            "div",
            { className: "dul_skillRow", key: skill.name },
            h("span", { className: "dul_skillDot", style: { background: PALETTE[index % PALETTE.length] } }),
            h("span", { className: "dul_skillName", title: skill.name }, skill.name),
            h("span", { className: "dul_skillCount" }, "×" + skill.count),
            h("span", { className: "dul_skillWhen" }, formatWhen(skill.lastAt, t)),
          );
        }),
      );
    }

    /** Modal confirmation for the two sensitive actions. */
    function ConfirmDialog(props) {
      var t = props.t;
      useEffect(
        function () {
          function onKey(event) {
            if (event.key === "Escape" && !props.busy) props.onCancel();
          }
          document.addEventListener("keydown", onKey);
          return function () {
            document.removeEventListener("keydown", onKey);
          };
        },
        [props.busy],
      );
      return h(
        "div",
        {
          className: "dul_overlay",
          onClick: function (event) {
            if (event.target === event.currentTarget && !props.busy) props.onCancel();
          },
        },
        h(
          "div",
          { className: "dul_dialog", role: "dialog", "aria-modal": "true", "aria-label": props.title },
          h("h2", { className: "dul_dialogTitle" }, props.title),
          h("p", { className: "dul_dialogText" }, props.message),
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
              props.busy ? t("deleting") : props.confirmLabel,
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
              row.synthetic ? t("group.orphanTitle") : session.title || t("untitled"),
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
      var [range, setRange] = useState("all");
      var [depth, setDepth] = useState("root");
      var [scope, setScope] = useState("all");
      var [query, setQuery] = useState("");
      var [loading, setLoading] = useState(false);
      var [pendingDelete, setPendingDelete] = useState(null);
      var [confirm, setConfirm] = useState(null);
      var [busy, setBusy] = useState(false);
      var [notice, setNotice] = useState("");
      var [hoverSlice, setHoverSlice] = useState(null);
      var [hoverTime, setHoverTime] = useState(null);
      var [dense, setDense] = useState(true);

      function load(scan) {
        setLoading(true);
        request(BASE + "/state" + (scan ? "?scan=1" : ""))
          .then(function (payload) {
            setData(payload);
            setPhase("ready");
            setError("");
          })
          .catch(function (failure) {
            setError(String(failure && failure.message ? failure.message : failure));
            setPhase("error");
          })
          .then(function () {
            setLoading(false);
          });
      }

      useEffect(function () {
        load(true);
      }, []);

      function act(sessionId, path) {
        setBusy(true);
        setNotice("");
        request(BASE + path, { method: "POST", body: { sessionId: sessionId } })
          .then(function (payload) {
            setData(payload.state);
            setPendingDelete(null);
            setConfirm(null);
          })
          .catch(function (failure) {
            setNotice(t("delete.error." + (failure && failure.code ? failure.code : "generic")));
            setPendingDelete(null);
            setConfirm(null);
          })
          .then(function () {
            setBusy(false);
          });
      }

      /** Open the confirmation dialog for one sensitive action. */
      function ask(kind, sessionId, name) {
        setNotice("");
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
        setConfirm(null);
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
          }

          var skills = Object.keys(skillMap)
            .map(function (name) {
              return skillMap[name];
            })
            .sort(function (left, right) {
              return right.count - left.count || right.lastAt - left.lastAt;
            })
            .slice(0, 8);

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
          });
        },
        [derived, scope, query],
      );

      var head = h(
        "div",
        { className: "dul_head" },
        h(
          "div",
          { className: "dul_titles" },
          h("h1", { className: "dul_title" }, t("page.title")),
          h("p", { className: "dul_subtitle" }, t("page.subtitle")),
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
            value: depth,
            onChange: setDepth,
            options: [
              { value: "root", label: t("depth.root") },
              { value: "all", label: t("depth.all") },
            ],
          }),
          h(Segmented, {
            value: dense ? "compact" : "comfortable",
            onChange: function (value) {
              setDense(value === "compact");
            },
            options: [
              { value: "compact", label: t("density.compact") },
              { value: "comfortable", label: t("density.comfortable") },
            ],
          }),
          h(Segmented, {
            value: range,
            onChange: setRange,
            options: [
              { value: "all", label: t("range.all") },
              { value: "30d", label: t("range.d30") },
              { value: "7d", label: t("range.d7") },
            ],
          }),
          h(
            "button",
            { type: "button", className: "dul_btn", disabled: loading, onClick: function () { load(true); } },
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


      return h(
        "div",
        { className: "dul_page" + (dense ? " dul_dense" : "") },
        h(
          "div",
          { className: "dul_inner" },
          head,
          h(
            "div",
            { className: "dul_top" },
            h(Kpi, {
              label: t("kpi.sessions"),
              value: String(derived.total.sessions),
              hint: t("kpi.sessionsBreak", {
                a: derived.byState.active.sessions,
                b: derived.byState.archived.sessions,
                d: derived.byState.deleted.sessions,
              }),
            }),
            h(Kpi, {
              label: t("kpi.tokens"),
              value: formatTokens(derived.total.tokens, t),
              hint: t("kpi.tokenBreak", {
                session: formatTokens(derived.rootTotals.tokens, t),
                sub: formatTokens(derived.subagents.tokens, t),
                turns: derived.total.turns,
              }),
            }),
            h(Kpi, {
              label: t("kpi.cost"),
              value: formatCost(derived.total.cost, data.usdToCny, t),
              hint: t("kpi.costBreak", {
                session: formatCost(derived.rootTotals.cost, data.usdToCny, t),
                sub: formatCost(derived.subagents.cost, data.usdToCny, t),
              }),
            }),
            h(Kpi, {
              label: t("kpi.cache"),
              value: derived.total.input + derived.total.cacheRead > 0 ? formatPercent(cacheHitOf(derived.total)) : "—",
              hint: t("kpi.cacheHint"),
            }),
            h(Kpi, {
              label: t("kpi.tools"),
              value: String(derived.timing.toolCalls),
              hint: t("kpi.toolsHint", { d: formatDuration(derived.timing.toolsMs, t) }),
            }),
            h(Kpi, {
              label: t("kpi.activeTime"),
              value: formatDuration(derived.timing.wallMs, t),
              hint: t("kpi.modelHint", { n: derived.timing.modelCalls }),
            }),
            h(DailyChart, {
              t: t,
              cardClass: "dul_chartCard",
              rate: data.usdToCny,
              title: t("chart.title"),
              hint: t("chart.hintShort"),
              empty: t("chart.empty"),
              series: derived.chart,
            }),
          ),
          h(
            "div",
            { className: "dul_grid2" },
            h(
              "div",
              { className: "dul_card" },
              h(
                "div",
                { className: "dul_cardHead" },
                h("span", { className: "dul_cardTitle" }, t("compose.title")),
                h("span", { className: "dul_cardHint" }, t("compose.hint")),
              ),
              h(
                "div",
                { className: "dul_donutRow" },
                h(Donut, {
                  size: 108,
                  stroke: 12,
                  slices: composition,
                  highlight: hoverSlice,
                  onHover: setHoverSlice,
                  centerValue: formatTokens(composeTotal, t),
                  centerLabel: t("donut.total"),
                }),
                h(CompositionLegend, { rows: composition, hover: hoverSlice, onHover: setHoverSlice }),
              ),
            ),
            h(
              "div",
              { className: "dul_card" },
              h(
                "div",
                { className: "dul_cardHead" },
                h("span", { className: "dul_cardTitle" }, t("timec.title")),
                h("span", { className: "dul_cardHint" }, t("timec.hint")),
              ),
              h(
                "div",
                { className: "dul_donutRow" },
                h(Donut, {
                  size: 108,
                  stroke: 12,
                  slices: timeRows,
                  highlight: hoverTime,
                  onHover: setHoverTime,
                  centerValue: formatDuration(spent.wallMs, t),
                  centerLabel: t("timec.active"),
                }),
                h(CompositionLegend, { rows: timeRows, hover: hoverTime, onHover: setHoverTime }),
              ),
            ),
          ),
          h(
            "div",
            { className: "dul_layout" },
            h(
              "div",
              { className: "dul_rail" },
              h(Heatmap, {
                t: t,
                title: t("heat.title"),
                hint: t("heat.hint"),
                less: t("heat.less"),
                more: t("heat.more"),
                series: derived.heat,
              }),
              h(
                "div",
                { className: "dul_card" },
                h(
                  "div",
                  { className: "dul_cardHead" },
                  h("span", { className: "dul_cardTitle" }, t("skill.title")),
                  h("span", { className: "dul_cardHint" }, t("skill.hint")),
                ),
                h(SkillList, { skills: derived.skills, t: t }),
              ),
            ),
            h(
              "div",
              { className: "dul_card" },
              h(
                "div",
                { className: "dul_filters" },
                h(Segmented, {
                  value: scope,
                  onChange: setScope,
                  options: [
                    { value: "all", label: t("filter.all") },
                    { value: "active", label: t("filter.active") },
                    { value: "archived", label: t("filter.archived") },
                    { value: "deleted", label: t("filter.deleted") },
                  ],
                }),
                h("input", {
                  className: "dul_search",
                  type: "search",
                  value: query,
                  placeholder: t("search.placeholder"),
                  onChange: function (event) {
                    setQuery(event.target.value);
                  },
                }),
                h("span", { className: "dul_cardHint" }, t("rows.count", { n: filtered.length })),
              ),
              notice !== "" ? h("p", { className: "dul_error" }, notice) : null,
              h(SessionCards, {
                rows: filtered,
                t: t,
                canManage: data.canDelete === true && data.canArchive === true,
                busy: busy,
                rate: data.usdToCny,
                onAsk: ask,
                onOpen: props.onOpenSession,
                aggregate:
                  (scope === "all" || scope === "deleted") && derived.byState.forgotten.sessions > 0
                    ? {
                        sessions: derived.byState.forgotten.sessions,
                        tokens: derived.byState.forgotten.tokens,
                        cost: derived.byState.forgotten.cost,
                      }
                    : null,
                onUnarchive: function (id) {
                  act(id, "/unarchive");
                },
              }),
            ),
          ),
        ),
        confirm !== null
          ? h(ConfirmDialog, {
              t: t,
              busy: busy,
              danger: confirm.kind === "delete",
              title: t("dialog." + confirm.kind + ".title"),
              message: t("dialog." + confirm.kind + ".body", { name: confirm.name }),
              confirmLabel: t("dialog." + confirm.kind + ".confirm"),
              onConfirm: confirmRun,
              onCancel: function () {
                setConfirm(null);
              },
            })
          : null,
      );
    }

    // ---------------------------------------------------------------------
    // Dictionaries
    // ---------------------------------------------------------------------

    var zh = {
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
      "depth.root": "顶层会话",
      "depth.all": "含子代理",
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
      "skill.hint": "本页范围内被注入的技能",
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
      "delete.error.generic": "删除失败，详情见运行日志。",
      "time.now": "刚刚",
      "time.minutes": "{n} 分钟前",
      "time.hours": "{n} 小时前",
      "time.days": "{n} 天前",
    };

    var en = {
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
      "depth.root": "Top-level",
      "depth.all": "With subagents",
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
      "skill.hint": "Skills injected in this scope",
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
      "delete.error.generic": "Deletion failed — check the run log.",
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
      __test: { groupSessions: groupSessions, normalizeId: normalizeId },
    };
  },
});
