/*
 * Throwaway prototype runtime. Production will use the shared React/shadcn UI.
 *
 * Icons below are the official Lucide v1.26.0 icon nodes already installed by
 * this repository through lucide-react (ISC license). They are embedded so the
 * prototypes remain usable from file:// without a CDN or build step.
 */
(() => {
  const ICONS = {
    "arrow-left": '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "chevron-left": '<path d="m15 18-6-6 6-6"/>',
    "chevron-right": '<path d="m9 18 6-6-6-6"/>',
    "circle-alert":
      '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
    "circle-check":
      '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    "columns-2":
      '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 3v18"/>',
    database:
      '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
    ellipsis:
      '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    fingerprint:
      '<path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M9 6.8a6 6 0 0 1 9 5.2c0 .47 0 1.17-.02 2"/>',
    headphones:
      '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
    history:
      '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    info:
      '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    languages:
      '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
    lock:
      '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    "log-out":
      '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
    menu:
      '<path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/>',
    mic:
      '<path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/>',
    move:
      '<path d="M12 2v20"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path d="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/>',
    monitor:
      '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
    "monitor-up":
      '<path d="m9 10 3-3 3 3"/><path d="M12 13V7"/><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M12 17v4"/><path d="M8 21h8"/>',
    moon:
      '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
    palette:
      '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>',
    "panel-left":
      '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
    "panel-right":
      '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>',
    pause:
      '<rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/>',
    play:
      '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>',
    "rotate-ccw":
      '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    settings:
      '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
    "shield-check":
      '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    smartphone:
      '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
    sparkles:
      '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
    square: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
    sun:
      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    "trash-2":
      '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  };

  const icon = (name, className = "") =>
    `<svg class="icon ${className}" aria-hidden="true" viewBox="0 0 24 24" data-icon="${name}"></svg>`;

  const hydrateIcons = (root = document) => {
    root.querySelectorAll("[data-icon]").forEach((svg) => {
      const markup = ICONS[svg.dataset.icon];
      if (markup) svg.innerHTML = markup;
    });
  };

  const replyRounds = [
    {
      label: "本轮建议",
      time: "刚刚",
      candidates: [
        [
          'すみません、それ<span class="particle">は</span>いくらです<span class="particle">か</span>？',
          "不好意思，那个多少钱？",
        ],
        ["はい、<ruby>お願<rt>おねが</rt></ruby>いします。", "好的，麻烦你了。"],
        [
          "<ruby>少々<rt>しょうしょう</rt></ruby>お<ruby>待<rt>ま</rt></ruby>ちください。",
          "请稍等一下。",
        ],
      ],
    },
    {
      label: "上一轮",
      time: "18 秒前",
      candidates: [
        [
          '<ruby>袋<rt>ふくろ</rt></ruby><span class="particle">を</span><ruby>一枚<rt>いちまい</rt></ruby><ruby>お願<rt>おねが</rt></ruby>いします。',
          "请给我一个袋子。",
        ],
        [
          'カード<span class="particle">で</span><ruby>払<rt>はら</rt></ruby>えます<span class="particle">か</span>？',
          "可以刷卡吗？",
        ],
        [
          'レシート<span class="particle">は</span><ruby>大丈夫<rt>だいじょうぶ</rt></ruby>です。',
          "不需要小票。",
        ],
      ],
    },
    {
      label: "上两轮",
      time: "42 秒前",
      candidates: [
        ["<ruby>温<rt>あたた</rt></ruby>めてください。", "请帮我加热。"],
        [
          'これ<span class="particle">は</span>どこ<span class="particle">に</span>あります<span class="particle">か</span>？',
          "这个在哪里？",
        ],
        ["ありがとうございます。", "谢谢。"],
      ],
    },
  ];

  const getRoundClasses = (index) => {
    if (index === 0) {
      return { desktop: "", web: "reply-round-current" };
    }
    if (index === 1) {
      return { desktop: " is-old-1", web: "reply-round-old" };
    }
    return {
      desktop: " is-old-2",
      web: "reply-round-old reply-round-oldest",
    };
  };

  const roundMarkup = (round, index, mode = "web") => {
    const classes = getRoundClasses(index);
    const list = round.candidates
      .map(
        ([target, meaning]) => `
          <li class="candidate">
            <div class="candidate-target">${target}</div>
            <div class="candidate-meaning">${meaning}</div>
          </li>`,
      )
      .join("");

    if (mode === "desktop") {
      return `
        <section class="desktop-round${classes.desktop}" data-final-round aria-label="${round.label}">
          <div class="round-head">
            <span class="round-label">${round.label}</span>
            <span class="round-time">${round.time}</span>
          </div>
          <ol class="candidate-list">${list}</ol>
        </section>`;
    }

    return `
      <section class="reply-round ${classes.web}" data-final-round aria-label="${round.label}">
        <div class="round-head">
          <span class="round-label">${round.label}</span>
          <span class="round-time">${round.time}</span>
        </div>
        <ol class="candidate-list">${list}</ol>
      </section>`;
  };

  const skeletonRoundMarkup = (mode = "web") => {
    const candidateWidths = [
      ["88%", "54%"],
      ["62%", "42%"],
      ["76%", "48%"],
    ];
    const list = candidateWidths
      .map(
        ([targetWidth, meaningWidth]) => `
          <li class="candidate candidate-skeleton" aria-hidden="true">
            <div class="candidate-target"><span class="skeleton-line" style="--skeleton-width:${targetWidth}"></span></div>
            <div class="candidate-meaning"><span class="skeleton-line" style="--skeleton-width:${meaningWidth}"></span></div>
          </li>`,
      )
      .join("");
    const className = mode === "desktop" ? "desktop-round" : "reply-round reply-round-current";
    return `
      <section class="${className} skeleton-round" data-skeleton-round hidden aria-label="正在生成建议">
        <div class="round-head">
          <span class="round-label">正在生成建议</span>
          <span class="round-time">刚刚</span>
        </div>
        <ol class="candidate-list">${list}</ol>
      </section>`;
  };

  const turnListMarkup = () => `
    <ol class="turn-list">
        <li class="turn">
          <div class="turn-speaker">对方 · 09:41</div>
          <div class="turn-bubble">袋はご利用ですか？</div>
        </li>
        <li class="turn is-me">
          <div class="turn-speaker">我 · 09:41</div>
          <div class="turn-bubble">はい、一枚お願いします。</div>
        </li>
        <li class="turn">
          <div class="turn-speaker">对方 · 09:42</div>
          <div class="turn-bubble">お支払いは現金ですか、カードですか？</div>
        </li>
        <li class="turn is-me">
          <div class="turn-speaker">我</div>
          <div class="turn-bubble partial">すみません、それは……</div>
        </li>
      </ol>`;

  const timelineMarkup = (compact = false) => `
    <div class="${compact ? "conversation-rail" : "timeline-panel"} panel">
      <div class="timeline-head">
        <h2>对话记录</h2>
        ${compact ? `<button class="icon-button" type="button" data-expand-rail aria-label="展开对话记录">${icon("panel-left")}</button>` : '<span class="badge badge-neutral">本次会话</span>'}
      </div>
      ${turnListMarkup()}
    </div>`;

  const labBarMarkup = (title, viewportControls = true, skeletonControl = false) => `
    <nav class="prototype-bar" aria-label="原型工具栏">
      <a href="./index.html" aria-label="返回原型目录">${icon("arrow-left")}</a>
      <span class="prototype-bar-label">${title}</span>
      ${
        viewportControls
          ? `
            <button class="is-active" type="button" data-viewport="desktop" aria-label="桌面预览">${icon("monitor", "icon-sm")}桌面</button>
            <button type="button" data-viewport="mobile" aria-label="手机预览">${icon("smartphone", "icon-sm")}手机</button>`
          : ""
      }
      ${
        skeletonControl
          ? `<button type="button" data-skeleton-toggle aria-pressed="false" aria-label="切换骨架预览">${icon("sparkles", "icon-sm")}<span data-skeleton-label>查看骨架</span></button>`
          : ""
      }
    </nav>`;

  const sessionToolbarMarkup = () => `
    <div class="web-top-stack">
      <header class="session-toolbar panel">
        <div class="session-state">
          <span class="status-dot" data-status-dot></span>
          <div class="session-state-copy">
            <div class="session-state-title" data-status-label>正在转写</div>
            <div class="session-state-meta">日语 · 初级 · 03:18</div>
          </div>
        </div>
        <div class="toolbar-actions">
          <div class="ai-toggle">
            ${icon("sparkles", "icon-sm")}
            <span class="toolbar-ai-label">AI 建议</span>
            <button class="switch is-on" type="button" data-ai-toggle aria-pressed="true"><span class="sr-only">切换 AI 建议</span></button>
          </div>
          <button class="icon-button is-on" type="button" data-pause aria-label="暂停会话">${icon("pause")}</button>
          <button class="button button-primary" type="button" data-stop>
            ${icon("square", "icon-sm")}<span class="toolbar-stop-label">停止</span>
          </button>
          <button class="icon-button" type="button" data-more aria-label="更多操作">${icon("ellipsis")}</button>
        </div>
        <div class="popover-menu" data-more-menu style="right:12px; top:55px;">
          <button class="popover-item" type="button" data-open-history>${icon("history", "icon-sm")}历史会话</button>
          <button class="popover-item" type="button">${icon("settings", "icon-sm")}设置</button>
        </div>
      </header>
      <div class="latest-transcript" aria-live="polite">
        <span class="speaker-pill">我</span>
        <span class="latest-transcript-copy">「すみません、それは……」</span>
      </div>
    </div>`;

  const webVariantCopy = {
    focus: {
      title: "方案 A · 专注舞台",
      description: "建议保持绝对主角，对话记录按需从侧边展开。",
      layoutClass: "layout-focus",
    },
    split: {
      title: "方案 B · 双栏工作台",
      description: "完整对话常驻左侧，适合长时间桌面使用。",
      layoutClass: "layout-split",
    },
    rail: {
      title: "方案 C · 舞台 + 窄轨",
      description: "保留对话的空间线索，需要时展开成完整记录。",
      layoutClass: "layout-rail",
    },
    hybrid: {
      title: "A+B · 可折叠工作台",
      description: "展开对话是双栏，收起后建议回到专注舞台。",
      layoutClass: "layout-hybrid",
    },
  };

  const hybridTimelineMarkup = () => `
    <aside class="hybrid-transcript panel" aria-label="可折叠对话记录">
      <div class="hybrid-transcript-expanded">
        <div class="timeline-head">
          <div>
            <h2>对话记录</h2>
            <p>本次会话 · 4 轮</p>
          </div>
        </div>
        ${turnListMarkup()}
      </div>
    </aside>`;

  const webSideContent = (variant) => {
    switch (variant) {
      case "split":
        return timelineMarkup(false);
      case "rail":
        return timelineMarkup(true);
      case "hybrid":
        return hybridTimelineMarkup();
      case "focus":
        return "";
      default:
        throw new Error(`Unknown Web prototype variant: ${variant}`);
    }
  };

  const webMarkup = (variant) => {
    const meta = webVariantCopy[variant];
    const sideContent = webSideContent(variant);
    const stage = `
      <main class="suggestion-stage panel">
        <div class="stage-heading">
          <div>
            <h1>${meta.title}</h1>
            <p>${meta.description}</p>
          </div>
          ${
            variant === "rail"
              ? `<button class="button button-secondary" type="button" data-expand-rail>${icon("panel-right", "icon-sm")}<span class="button-history-label">展开对话</span></button>`
              : variant === "hybrid"
                ? `<button class="button button-secondary hybrid-open-transcript" type="button" data-toggle-transcript aria-expanded="true">${icon("panel-left", "icon-sm")}<span>对话记录</span></button>`
                : ""
          }
        </div>
        ${skeletonRoundMarkup()}
        ${replyRounds.map((round, index) => roundMarkup(round, index)).join("")}
      </main>`;

    return `
      ${labBarMarkup(meta.title, true, true)}
      <div class="prototype-page">
        <div class="preview-shell" data-preview-shell>
          <div class="preview-scroll">
            <div class="web-app${variant === "hybrid" ? " web-app-hybrid" : ""}">
              ${sessionToolbarMarkup()}
              <div class="web-main ${meta.layoutClass}" ${variant === "split" ? 'data-mobile-tab="suggestions"' : ""} ${variant === "hybrid" ? 'data-transcript="expanded"' : ""}>
                ${
                  variant === "split"
                    ? `
                      <div class="mobile-view-tabs" aria-label="手机视图">
                        <button class="is-active" type="button" data-mobile-tab="suggestions">建议</button>
                        <button type="button" data-mobile-tab="conversation">对话</button>
                      </div>`
                    : ""
                }
                ${variant === "split" || variant === "hybrid" ? sideContent + stage : stage + sideContent}
              </div>
              ${
                variant === "focus"
                  ? `
                    <button class="button button-secondary focus-side-button" type="button" data-open-history>
                      ${icon("panel-left", "icon-sm")}<span class="button-history-label">对话记录</span>
                    </button>
                    <aside class="timeline-sheet" data-timeline-sheet>
                      ${timelineMarkup(false)}
                    </aside>`
                  : ""
              }
            </div>
          </div>
        </div>
      </div>
      <div class="dialog-backdrop" data-dialog="stop" role="dialog" aria-modal="true" aria-labelledby="stop-title">
        <div class="dialog-card panel">
          <h2 id="stop-title">停止并保存这次会话？</h2>
          <p>当前转写和建议会立即保存。再次开启时会创建新的对话场景，不会延续本次上下文。</p>
          <div class="dialog-actions">
            <button class="button button-plain" type="button" data-dialog-close>继续会话</button>
            <button class="button button-primary" type="button" data-confirm-stop>停止并保存</button>
          </div>
        </div>
      </div>
      <div class="toast" role="status" aria-live="polite" data-toast></div>`;
  };

  const showToast = (message) => {
    const toast = document.querySelector("[data-toast]");
    if (!toast) return;
    toast.innerHTML = `${icon("circle-check", "icon-sm")}${message}`;
    hydrateIcons(toast);
    toast.classList.add("is-visible");
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(
      () => toast.classList.remove("is-visible"),
      2200,
    );
  };

  const setDialog = (name, open) => {
    document
      .querySelector(`[data-dialog="${name}"]`)
      ?.classList.toggle("is-open", open);
  };

  const setHybridTranscript = (expanded) => {
    const layout = document.querySelector(".layout-hybrid");
    if (!layout) return;
    layout.dataset.transcript = expanded ? "expanded" : "collapsed";
    document.querySelectorAll("[data-toggle-transcript]").forEach((item) => {
      item.setAttribute("aria-expanded", String(expanded));
      item.setAttribute(
        "aria-label",
        expanded ? "收起对话记录" : "展开对话记录",
      );
    });
  };

  const setupLabBar = () => {
    const shell = document.querySelector("[data-preview-shell]");
    const viewportButtons = document.querySelectorAll("[data-viewport]");
    const setViewport = (viewport) => {
      const mobile = viewport === "mobile";
      shell?.classList.toggle("is-mobile", mobile);
      if (mobile) setHybridTranscript(false);
      viewportButtons.forEach((item) =>
        item.classList.toggle("is-active", item.dataset.viewport === viewport),
      );
    };

    viewportButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const viewport = button.dataset.viewport;
        if (!viewport) return;
        setViewport(viewport);
      });
    });

    const requestedViewport = new URLSearchParams(location.search).get(
      "viewport",
    );
    if (requestedViewport === "mobile") setViewport("mobile");
  };

  const setupSkeletonPreview = () => {
    const toggle = document.querySelector("[data-skeleton-toggle]");
    const skeletonRounds = document.querySelectorAll("[data-skeleton-round]");
    const finalRounds = document.querySelectorAll("[data-final-round]");
    if (!toggle || skeletonRounds.length === 0) return;

    let skeletonVisible = false;
    const render = () => {
      toggle.classList.toggle("is-active", skeletonVisible);
      toggle.setAttribute("aria-pressed", String(skeletonVisible));
      const label = toggle.querySelector("[data-skeleton-label]");
      if (label) label.textContent = skeletonVisible ? "查看结果" : "查看骨架";
      skeletonRounds.forEach((round) => {
        round.hidden = !skeletonVisible;
      });
      finalRounds.forEach((round) => {
        round.hidden = skeletonVisible;
      });
    };

    toggle.addEventListener("click", () => {
      skeletonVisible = !skeletonVisible;
      render();
    });
    render();
  };

  const setupSessionState = () => {
    let state = "running";
    const pauseButton = document.querySelector("[data-pause]");
    const statusLabel = document.querySelector("[data-status-label]");
    const statusDot = document.querySelector("[data-status-dot]");

    const render = () => {
      if (!pauseButton || !statusLabel || !statusDot) return;
      const paused = state === "paused";
      const stopped = state === "stopped";
      let label = "正在转写";
      let pauseLabel = "暂停会话";
      if (paused) {
        label = "已暂停";
        pauseLabel = "继续会话";
      } else if (stopped) {
        label = "会话已保存";
        pauseLabel = "会话已停止";
      }

      pauseButton.innerHTML = icon(paused || stopped ? "play" : "pause");
      pauseButton.disabled = stopped;
      pauseButton.classList.toggle("is-on", !stopped);
      pauseButton.setAttribute("aria-label", pauseLabel);
      statusLabel.textContent = label;
      statusDot.className = `status-dot${paused ? " is-paused" : ""}${stopped ? " is-stopped" : ""}`;
      hydrateIcons(pauseButton);
    };

    pauseButton?.addEventListener("click", () => {
      state = state === "running" ? "paused" : "running";
      render();
      showToast(state === "paused" ? "已暂停，仍是同一次会话" : "已继续转写");
    });

    document
      .querySelector("[data-confirm-stop]")
      ?.addEventListener("click", () => {
        state = "stopped";
        setDialog("stop", false);
        render();
        showToast("会话已保存；下次开启会创建新场景");
      });

    render();
  };

  const setupWebInteractions = () => {
    setupLabBar();
    setupSkeletonPreview();
    setupSessionState();

    document
      .querySelector("[data-stop]")
      ?.addEventListener("click", () => setDialog("stop", true));
    document
      .querySelectorAll("[data-dialog-close]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          button.closest(".dialog-backdrop")?.classList.remove("is-open"),
        ),
      );

    const aiToggle = document.querySelector("[data-ai-toggle]");
    aiToggle?.addEventListener("click", () => {
      const on = !aiToggle.classList.contains("is-on");
      aiToggle.classList.toggle("is-on", on);
      aiToggle.setAttribute("aria-pressed", String(on));
      showToast(on ? "AI 建议已开启" : "AI 建议已关闭；转写继续");
    });

    const moreMenu = document.querySelector("[data-more-menu]");
    document.querySelector("[data-more]")?.addEventListener("click", () => {
      moreMenu?.classList.toggle("is-open");
    });

    const timelineSheet = document.querySelector("[data-timeline-sheet]");
    document.querySelectorAll("[data-open-history]").forEach((button) => {
      button.addEventListener("click", () => {
        if (timelineSheet) {
          timelineSheet.classList.toggle("is-open");
          moreMenu?.classList.remove("is-open");
        } else {
          showToast("历史会话会从这里打开");
        }
      });
    });

    const splitLayout = document.querySelector(".layout-split");
    document.querySelectorAll("[data-mobile-tab]").forEach((button) => {
      if (button === splitLayout) return;
      button.addEventListener("click", () => {
        const tab = button.dataset.mobileTab;
        if (!tab || !splitLayout) return;
        splitLayout.dataset.mobileTab = tab;
        document
          .querySelectorAll(".mobile-view-tabs [data-mobile-tab]")
          .forEach((item) =>
            item.classList.toggle("is-active", item === button),
          );
      });
    });

    const rail = document.querySelector(".conversation-rail");
    document.querySelectorAll("[data-expand-rail]").forEach((button) => {
      button.addEventListener("click", () => {
        const expanded = !rail?.classList.contains("is-expanded");
        rail?.classList.toggle("is-expanded", expanded);
        document
          .querySelectorAll("[data-expand-rail]")
          .forEach((item) =>
            item.setAttribute(
              "aria-label",
              expanded ? "收起对话记录" : "展开对话记录",
            ),
          );
      });
    });

    const hybridLayout = document.querySelector(".layout-hybrid");
    document.querySelectorAll("[data-toggle-transcript]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!hybridLayout) return;
        const expanded = hybridLayout.dataset.transcript !== "collapsed";
        setHybridTranscript(!expanded);
      });
    });
  };

  const desktopMarkup = () => `
    ${labBarMarkup("桌面悬浮窗 · AIRI 式边缘缩放", false, true)}
    <div class="prototype-page">
      <div class="preview-shell desktop-prototype" data-preview-shell>
        <div class="desktop-screen" data-desktop-screen>
          <div class="mac-menu-bar">
            <div class="menu-bar-left"><strong>访达</strong><span>文件</span><span>编辑</span><span>显示</span></div>
            <div class="menu-bar-right">
              <span>周六 09:42</span>
              <button class="status-bar-trigger" type="button" data-status-trigger aria-label="打开 KiboTalk 状态栏菜单">
                <img class="status-brand" src="./assets/kibotalk-mark.svg" alt="KiboTalk" />
              </button>
            </div>
          </div>
          <div class="desktop-hint">
            <b>可交互原型</b>
            拖动 Island 的四向箭头移动；松手后按屏幕上下半区翻转。移到窗体会显示连续细边框，沿边缘缩放，不显示四角圆点。
          </div>
          <div class="status-menu" data-status-menu>
            <div class="status-menu-head">
              <span class="status-dot" data-menu-status-dot></span>
              <div><strong data-menu-status>正在转写</strong><span data-menu-subtitle>日语 · 03:18</span></div>
            </div>
            <div class="popover-separator"></div>
            <button class="popover-item" type="button" data-show-hide>${icon("panel-left", "icon-sm")}<span data-show-hide-label>隐藏悬浮窗</span></button>
            <button class="popover-item" type="button" data-menu-pause>${icon("pause", "icon-sm")}<span data-menu-pause-label>暂停</span></button>
            <button class="popover-item" type="button" data-menu-stop>${icon("square", "icon-sm")}停止并保存</button>
            <button class="popover-item" type="button" data-menu-ai>${icon("sparkles", "icon-sm")}<span data-menu-ai-label>关闭 AI 建议</span></button>
            <div class="popover-separator"></div>
            <button class="popover-item" type="button">${icon("history", "icon-sm")}历史会话</button>
            <button class="popover-item" type="button">${icon("settings", "icon-sm")}设置</button>
            <div class="popover-separator"></div>
            <button class="popover-item is-danger" type="button" data-quit>${icon("log-out", "icon-sm")}退出 KiboTalk…</button>
          </div>
          <div class="floating-window" data-floating-window data-rounds="3">
            <div class="floating-layout">
              <div class="float-content">
                <div class="desktop-transcript"><strong>我</strong>「すみません、それは……」</div>
                ${skeletonRoundMarkup("desktop")}
                ${replyRounds.map((round, index) => roundMarkup(round, index, "desktop")).join("")}
              </div>
              <div class="desktop-island" data-island>
                <span class="island-status"><span class="status-dot" data-status-dot></span><span data-status-label>转写中</span></span>
                <span class="island-separator"></span>
                <button class="island-button is-on" type="button" data-pause aria-label="暂停会话">${icon("pause", "icon-sm")}</button>
                <button class="island-button" type="button" data-stop aria-label="停止并保存">${icon("square", "icon-sm")}</button>
                <button class="island-button is-on" type="button" data-ai-toggle aria-label="切换 AI 建议">${icon("sparkles", "icon-sm")}</button>
                <span class="island-separator"></span>
                <button class="island-button island-drag" type="button" data-drag-handle aria-label="移动悬浮窗">${icon("move", "icon-sm")}</button>
                <button class="island-button" type="button" data-island-more aria-label="更多操作">${icon("ellipsis", "icon-sm")}</button>
                <div class="popover-menu island-popover" data-island-menu>
                  <button class="popover-item" type="button">${icon("history", "icon-sm")}历史会话</button>
                  <button class="popover-item" type="button">${icon("settings", "icon-sm")}设置</button>
                  <button class="popover-item" type="button" data-hide-float>${icon("panel-left", "icon-sm")}隐藏悬浮窗</button>
                  <div class="popover-separator"></div>
                  <button class="popover-item is-danger" type="button" data-quit>${icon("log-out", "icon-sm")}退出 KiboTalk…</button>
                </div>
              </div>
            </div>
            <span class="resize-outline" aria-hidden="true"></span>
            ${["n", "e", "s", "w", "ne", "nw", "se", "sw"].map((edge) => `<span class="resize-handle" data-edge="${edge}" aria-hidden="true"></span>`).join("")}
          </div>
          <div class="desktop-size-readout" data-size-readout>420 × 640 · 3 轮</div>
        </div>
      </div>
    </div>
    <div class="dialog-backdrop desktop-dialog" data-dialog="stop" role="dialog" aria-modal="true">
      <div class="dialog-card panel">
        <h2>停止并保存这次会话？</h2>
        <p>当前转写会立即保存并在后台生成总结。下次开启会创建新的对话场景。</p>
        <div class="dialog-actions">
          <button class="button button-plain" type="button" data-dialog-close>继续会话</button>
          <button class="button button-primary" type="button" data-confirm-stop>停止并保存</button>
        </div>
      </div>
    </div>
    <div class="dialog-backdrop desktop-dialog" data-dialog="quit" role="dialog" aria-modal="true">
      <div class="dialog-card panel">
        <h2 data-quit-title>结束会话并退出？</h2>
        <p data-quit-copy>转写会先封存并保存，然后退出 KiboTalk。后台总结会在下次启动时继续。</p>
        <div class="dialog-actions">
          <button class="button button-plain" type="button" data-dialog-close>取消</button>
          <button class="button button-danger" type="button" data-confirm-quit>结束会话并退出</button>
        </div>
      </div>
    </div>
    <div class="toast" role="status" aria-live="polite" data-toast></div>`;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const setupDesktopInteractions = () => {
    setupSkeletonPreview();
    const screen = document.querySelector("[data-desktop-screen]");
    const floating = document.querySelector("[data-floating-window]");
    const island = document.querySelector("[data-island]");
    const statusMenu = document.querySelector("[data-status-menu]");
    const islandMenu = document.querySelector("[data-island-menu]");
    const sizeReadout = document.querySelector("[data-size-readout]");
    const floatingLayout = floating?.querySelector(".floating-layout");
    const floatContent = floating?.querySelector(".float-content");
    if (!screen || !floating || !island) return;

    let sessionState = "running";
    let aiOn = true;
    let floatingVisible = true;
    let hiddenHasSuggestion = false;

    const contentFits = () => {
      if (!floatingLayout || !floatContent) return true;
      const visibleItems = [...floatContent.children].filter(
        (item) => !item.hidden && getComputedStyle(item).display !== "none",
      );
      const contentGap = parseFloat(getComputedStyle(floatContent).rowGap) || 0;
      const layoutGap =
        parseFloat(getComputedStyle(floatingLayout).rowGap) || 0;
      const contentHeight =
        visibleItems.reduce((total, item) => total + item.offsetHeight, 0) +
        Math.max(visibleItems.length - 1, 0) * contentGap;
      return (
        contentHeight + island.offsetHeight + layoutGap <=
        floating.clientHeight + 0.5
      );
    };

    const updateRoundCount = () => {
      const height = floating.getBoundingClientRect().height;
      let rounds = height >= 610 ? 3 : height >= 500 ? 2 : 1;
      floating.dataset.rounds = String(rounds);
      while (rounds > 1 && !contentFits()) {
        rounds -= 1;
        floating.dataset.rounds = String(rounds);
      }
      if (sizeReadout) {
        sizeReadout.textContent = `${Math.round(floating.offsetWidth)} × ${Math.round(floating.offsetHeight)} · ${rounds} 轮`;
      }
    };

    const renderSessionState = () => {
      const paused = sessionState === "paused";
      const stopped = sessionState === "stopped";
      let islandLabel = "转写中";
      let menuLabel = "正在转写";
      let menuSubtitle = "日语 · 03:18";
      let pauseLabel = "暂停";
      if (paused) {
        islandLabel = "已暂停";
        menuLabel = "已暂停";
        pauseLabel = "继续";
      } else if (stopped) {
        islandLabel = "已停止";
        menuLabel = "会话已保存";
        menuSubtitle = "可以开始新会话";
        pauseLabel = "开始新会话";
      }
      if (hiddenHasSuggestion) menuSubtitle = "有新建议 · 点击显示";

      document.querySelectorAll("[data-status-label]").forEach((label) => {
        label.textContent = islandLabel;
      });
      document.querySelectorAll("[data-status-dot], [data-menu-status-dot]").forEach((dot) => {
        dot.className = `status-dot${paused ? " is-paused" : ""}${stopped ? " is-stopped" : ""}`;
      });
      const menuStatus = document.querySelector("[data-menu-status]");
      const menuSubtitleElement = document.querySelector(
        "[data-menu-subtitle]",
      );
      if (menuStatus) menuStatus.textContent = menuLabel;
      if (menuSubtitleElement) menuSubtitleElement.textContent = menuSubtitle;

      const pauseButtons = document.querySelectorAll("[data-pause], [data-menu-pause]");
      pauseButtons.forEach((button) => {
        button.disabled = stopped;
        const menuCopy = button.hasAttribute("data-menu-pause")
          ? `<span data-menu-pause-label>${pauseLabel}</span>`
          : "";
        button.innerHTML = `${icon(paused || stopped ? "play" : "pause", "icon-sm")}${menuCopy}`;
        hydrateIcons(button);
      });
      document.querySelector("[data-menu-stop]")?.toggleAttribute("disabled", stopped);
    };

    const renderVisibility = () => {
      floating.hidden = !floatingVisible;
      document.querySelectorAll("[data-show-hide-label]").forEach((label) => {
        label.textContent = floatingVisible ? "隐藏悬浮窗" : "显示悬浮窗";
      });
    };

    const togglePause = () => {
      if (sessionState === "stopped") return;
      sessionState = sessionState === "running" ? "paused" : "running";
      renderSessionState();
      showToast(sessionState === "paused" ? "已暂停并释放音频采集" : "已继续同一次会话");
    };

    const toggleAi = () => {
      aiOn = !aiOn;
      document.querySelectorAll("[data-ai-toggle]").forEach((button) => {
        button.classList.toggle("is-on", aiOn);
      });
      const menuLabel = document.querySelector("[data-menu-ai-label]");
      if (menuLabel) menuLabel.textContent = aiOn ? "关闭 AI 建议" : "开启 AI 建议";
      showToast(aiOn ? "AI 建议已开启" : "AI 建议已关闭；转写继续");
    };

    const setFloatingVisible = (visible) => {
      floatingVisible = visible;
      hiddenHasSuggestion = !visible && sessionState !== "stopped";
      renderVisibility();
      renderSessionState();
      statusMenu?.classList.remove("is-open");
      if (!visible) showToast("悬浮窗已隐藏，会话仍在继续");
    };

    document.querySelector("[data-status-trigger]")?.addEventListener("click", () => {
      statusMenu?.classList.toggle("is-open");
      islandMenu?.classList.remove("is-open");
    });
    document.querySelector("[data-island-more]")?.addEventListener("click", () => {
      islandMenu?.classList.toggle("is-open");
      statusMenu?.classList.remove("is-open");
    });
    document.querySelectorAll("[data-pause], [data-menu-pause]").forEach((button) => {
      button.addEventListener("click", togglePause);
    });
    document.querySelectorAll("[data-ai-toggle], [data-menu-ai]").forEach((button) => {
      button.addEventListener("click", toggleAi);
    });
    document.querySelectorAll("[data-stop], [data-menu-stop]").forEach((button) => {
      button.addEventListener("click", () => setDialog("stop", true));
    });
    document.querySelector("[data-confirm-stop]")?.addEventListener("click", () => {
      sessionState = "stopped";
      setDialog("stop", false);
      renderSessionState();
      showToast("会话已保存；总结将在后台生成");
    });
    document.querySelectorAll("[data-quit]").forEach((button) => {
      button.addEventListener("click", () => {
        const active = sessionState !== "stopped";
        document.querySelector("[data-quit-title]").textContent = active
          ? "结束会话并退出？"
          : "退出 KiboTalk？";
        document.querySelector("[data-quit-copy]").textContent = active
          ? "转写会先封存并保存，然后退出 KiboTalk。后台总结会在下次启动时继续。"
          : "KiboTalk 会退出。已经保存的会话不会受影响。";
        document.querySelector("[data-confirm-quit]").textContent = active
          ? "结束会话并退出"
          : "退出";
        setDialog("quit", true);
        statusMenu?.classList.remove("is-open");
        islandMenu?.classList.remove("is-open");
      });
    });
    document.querySelector("[data-confirm-quit]")?.addEventListener("click", () => {
      setDialog("quit", false);
      showToast("原型：已确认退出");
    });
    document.querySelectorAll("[data-dialog-close]").forEach((button) => {
      button.addEventListener("click", () => {
        button.closest(".dialog-backdrop")?.classList.remove("is-open");
      });
    });
    document.querySelector("[data-hide-float]")?.addEventListener("click", () => {
      islandMenu?.classList.remove("is-open");
      setFloatingVisible(false);
    });
    document.querySelector("[data-show-hide]")?.addEventListener("click", () => {
      setFloatingVisible(!floatingVisible);
    });

    const maybeFlip = () => {
      const screenRect = screen.getBoundingClientRect();
      const before = island.getBoundingClientRect();
      const midpoint = screenRect.top + screenRect.height / 2;
      const center = before.top + before.height / 2;
      const isBelow = floating.classList.contains("is-below");
      const nextBelow = isBelow ? center < midpoint + 24 : center < midpoint - 24;
      if (nextBelow === isBelow) return;
      floating.classList.toggle("is-below", nextBelow);
      const after = island.getBoundingClientRect();
      const nextTop = parseFloat(floating.style.top || `${floating.offsetTop}`) + before.top - after.top;
      floating.style.top = `${nextTop}px`;
      islandMenu?.classList.remove("is-open");
      showToast(nextBelow ? "Island 在上方，转写和便利贴显示在下面" : "Island 在下方，转写始终在便利贴上方");
    };

    const dragHandle = document.querySelector("[data-drag-handle]");
    dragHandle?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      dragHandle.setPointerCapture(event.pointerId);
      const startRect = floating.getBoundingClientRect();
      const screenRect = screen.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;

      const move = (moveEvent) => {
        const left = startRect.left - screenRect.left + moveEvent.clientX - startX;
        const top = startRect.top - screenRect.top + moveEvent.clientY - startY;
        floating.style.left = `${clamp(left, 12, screenRect.width - startRect.width - 12)}px`;
        floating.style.top = `${clamp(top, -startRect.height + 78, screenRect.height - 68)}px`;
      };
      const end = () => {
        dragHandle.removeEventListener("pointermove", move);
        dragHandle.removeEventListener("pointerup", end);
        dragHandle.removeEventListener("pointercancel", end);
        maybeFlip();
      };
      dragHandle.addEventListener("pointermove", move);
      dragHandle.addEventListener("pointerup", end);
      dragHandle.addEventListener("pointercancel", end);
    });

    document.querySelectorAll(".resize-handle").forEach((handle) => {
      handle.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        floating.classList.add("is-resizing");
        handle.setPointerCapture(event.pointerId);
        const edge = handle.dataset.edge;
        const start = floating.getBoundingClientRect();
        const screenRect = screen.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;

        const move = (moveEvent) => {
          const dx = moveEvent.clientX - startX;
          const dy = moveEvent.clientY - startY;
          let width = start.width;
          let height = start.height;
          let left = start.left - screenRect.left;
          let top = start.top - screenRect.top;

          if (edge.includes("e")) width = clamp(start.width + dx, 360, Math.min(680, screenRect.width - 24));
          if (edge.includes("s")) height = clamp(start.height + dy, 420, screenRect.height - 42);
          if (edge.includes("w")) {
            width = clamp(start.width - dx, 360, Math.min(680, screenRect.width - 24));
            left = start.left - screenRect.left + start.width - width;
          }
          if (edge.includes("n")) {
            height = clamp(start.height - dy, 420, screenRect.height - 42);
            top = start.top - screenRect.top + start.height - height;
          }

          floating.style.width = `${width}px`;
          floating.style.height = `${height}px`;
          floating.style.left = `${left}px`;
          floating.style.top = `${top}px`;
          updateRoundCount();
        };
        const end = () => {
          floating.classList.remove("is-resizing");
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", end);
          handle.removeEventListener("pointercancel", end);
          maybeFlip();
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", end);
        handle.addEventListener("pointercancel", end);
      });
    });

    window.addEventListener("resize", updateRoundCount);
    updateRoundCount();
    renderSessionState();
    renderVisibility();
  };

  const SETTINGS_I18N = {
    zh: {
      settings: "设置",
      stopped: "已停止",
      active: "会话中",
      general: "通用",
      conversation: "对话",
      voiceprint: "声纹",
      permissions: "权限",
      data: "数据与隐私",
      about: "关于",
      generalTitle: "通用",
      generalDescription: "界面、外观与启动行为。",
      lockStopped: "会话已停止，所有设置均可修改并立即生效。",
      lockActive: "会话进行中：语言、音频与数据操作已锁定。停止后才能修改。",
      interfaceSection: "界面",
      uiLanguage: "界面语言",
      uiLanguageDescription: "同时决定下一次会话的候选释义语言；仅停止时可切换。",
      theme: "外观",
      themeDescription: "便利贴在深色模式下仍保持明亮黄色。",
      system: "跟随系统",
      light: "浅色",
      dark: "深色",
      startupSection: "启动",
      launchAtLogin: "登录时启动",
      launchDescription: "仅桌面应用；启动后保持已停止状态。",
      conversationTitle: "对话",
      conversationDescription: "这些设置会在开始时冻结为会话快照。",
      languageAndLevel: "对话语言与水平",
      languageLevelDescription: "水平跟随每种对话语言分别记忆。",
      japanese: "日语",
      english: "英语",
      chinese: "中文",
      beginner: "初级",
      intermediate: "中级",
      advanced: "高级",
      audioSection: "桌面音频",
      audioSource: "音频来源",
      audioSourceDescription: "麦克风与系统音频保持两路，不会混音。",
      microphone: "麦克风",
      systemAudio: "系统音频",
      bothAudio: "麦克风 + 系统音频",
      microphoneDevice: "麦克风设备",
      microphoneDeviceDescription: "设备断开时会意外暂停并要求重新选择。",
      systemDefault: "系统默认",
      macbookMic: "MacBook 麦克风",
      airpodsMic: "路路的 AirPods",
      usbMic: "USB Podcast Mic",
      headphonesHint: "同时采集时建议佩戴耳机，避免扬声器串音造成重复转写。",
      voiceprintTitle: "声纹",
      voiceprintDescription: "声纹是开始任何音频会话的必要条件。",
      voiceprintStatus: "已录入声纹",
      voiceprintStatusDescription: "上次录制：3 天前 · 仅保存在此设备",
      rerecord: "重新录制",
      deleteVoiceprint: "删除声纹",
      deleteVoiceprintDescription: "删除后必须重新录入才能开始会话。",
      permissionsTitle: "权限",
      permissionsDescription: "始终显示相关系统权限及当前状态。",
      micPermission: "麦克风",
      micPermissionDescription: "用于当面对话与用户声纹识别。",
      screenPermission: "系统音频 / 屏幕录制",
      screenPermissionDescription: "用于桌面会议与视频中的对方声音。",
      granted: "已允许",
      openSystemSettings: "打开系统设置",
      dataTitle: "数据与隐私",
      dataDescription: "会话文字只保存在本地；不保存原始音频。",
      localDataSection: "本地数据",
      clearHistory: "清除会话历史",
      clearHistoryDescription: "删除文字、候选、总结与会话元数据。",
      clear: "清除…",
      resetPersonal: "清除个人数据并重置",
      resetPersonalDescription: "删除偏好、声纹和会话；已缓存的语音能力不会删除。",
      reset: "重置…",
      aboutTitle: "关于",
      aboutDescription: "版本信息与桌面应用操作。",
      appSection: "KiboTalk",
      version: "版本",
      versionDescription: "Live Reply Coach",
      quitApp: "退出 KiboTalk",
      quitDescription: "退出前会要求确认；活跃会话会先封存保存。",
      quit: "退出…",
      preparing: "正在准备语音能力",
      lockedShort: "停止后可改",
      desktopOnly: "仅桌面",
      voiceDialogTitle: "删除声纹？",
      voiceDialogCopy: "删除后将无法开始会话，直到重新录入声纹。已保存的会话不会被删除。",
      cancel: "取消",
      confirmDelete: "删除声纹",
      resetDialogTitle: "清除个人数据并重置？",
      resetDialogCopy: "偏好、声纹与全部会话将从本机删除。语音能力缓存会保留。",
      confirmReset: "清除并重置",
      quitDialogTitle: "退出 KiboTalk？",
      quitDialogCopy: "当前没有进行中的会话。已经保存的数据不会受影响。",
      confirmQuit: "退出",
    },
    ja: {
      settings: "設定",
      stopped: "停止中",
      active: "セッション中",
      general: "一般",
      conversation: "会話",
      voiceprint: "声紋",
      permissions: "権限",
      data: "データとプライバシー",
      about: "KiboTalk について",
      generalTitle: "一般",
      generalDescription: "表示、テーマ、起動時の動作を設定します。",
      lockStopped: "セッションは停止中です。すべての設定を変更でき、すぐに反映されます。",
      lockActive: "セッション中：言語、音声、データ操作はロックされています。停止後に変更できます。",
      interfaceSection: "表示",
      uiLanguage: "表示言語",
      uiLanguageDescription: "次回セッションの候補の意味表示にも使われます。停止中のみ変更できます。",
      theme: "テーマ",
      themeDescription: "ダークモードでも付箋は明るい黄色のままです。",
      system: "システム設定",
      light: "ライト",
      dark: "ダーク",
      startupSection: "起動",
      launchAtLogin: "ログイン時に起動",
      launchDescription: "デスクトップアプリのみ。停止状態で起動します。",
      conversationTitle: "会話",
      conversationDescription: "開始時に固定され、セッションの設定として保存されます。",
      languageAndLevel: "会話言語とレベル",
      languageLevelDescription: "レベルは会話言語ごとに記憶されます。",
      japanese: "日本語",
      english: "英語",
      chinese: "中国語",
      beginner: "初級",
      intermediate: "中級",
      advanced: "上級",
      audioSection: "デスクトップ音声",
      audioSource: "音声ソース",
      audioSourceDescription: "マイクとシステム音声は別々に処理され、ミックスされません。",
      microphone: "マイク",
      systemAudio: "システム音声",
      bothAudio: "マイク + システム音声",
      microphoneDevice: "マイクデバイス",
      microphoneDeviceDescription: "切断時は一時停止し、再選択を求めます。",
      systemDefault: "システムデフォルト",
      macbookMic: "MacBook のマイク",
      airpodsMic: "路路の AirPods",
      usbMic: "USB Podcast Mic",
      headphonesHint: "同時収録では、スピーカー音の重複文字起こしを避けるためヘッドホンを推奨します。",
      voiceprintTitle: "声紋",
      voiceprintDescription: "音声セッションを開始するには声紋が必要です。",
      voiceprintStatus: "声紋を登録済み",
      voiceprintStatusDescription: "最終録音：3日前 · このデバイスにのみ保存",
      rerecord: "録り直す",
      deleteVoiceprint: "声紋を削除",
      deleteVoiceprintDescription: "削除後は、再登録するまでセッションを開始できません。",
      permissionsTitle: "権限",
      permissionsDescription: "必要なシステム権限と現在の状態を常に表示します。",
      micPermission: "マイク",
      micPermissionDescription: "対面会話と話者認識に使用します。",
      screenPermission: "システム音声 / 画面収録",
      screenPermissionDescription: "デスクトップ会議や動画の相手の声に使用します。",
      granted: "許可済み",
      openSystemSettings: "システム設定を開く",
      dataTitle: "データとプライバシー",
      dataDescription: "会話テキストはローカル保存のみ。元音声は保存しません。",
      localDataSection: "ローカルデータ",
      clearHistory: "会話履歴を削除",
      clearHistoryDescription: "テキスト、候補、要約、セッション情報を削除します。",
      clear: "削除…",
      resetPersonal: "個人データを削除してリセット",
      resetPersonalDescription: "設定、声紋、会話を削除します。音声機能のキャッシュは残ります。",
      reset: "リセット…",
      aboutTitle: "KiboTalk について",
      aboutDescription: "バージョン情報とデスクトップアプリの操作。",
      appSection: "KiboTalk",
      version: "バージョン",
      versionDescription: "Live Reply Coach",
      quitApp: "KiboTalk を終了",
      quitDescription: "終了前に確認します。進行中のセッションは先に保存されます。",
      quit: "終了…",
      preparing: "音声機能を準備中",
      lockedShort: "停止後に変更",
      desktopOnly: "デスクトップのみ",
      voiceDialogTitle: "声紋を削除しますか？",
      voiceDialogCopy: "削除後は、声紋を再登録するまでセッションを開始できません。保存済みの会話は残ります。",
      cancel: "キャンセル",
      confirmDelete: "声紋を削除",
      resetDialogTitle: "個人データを削除してリセットしますか？",
      resetDialogCopy: "設定、声紋、すべての会話をこのデバイスから削除します。音声機能のキャッシュは残ります。",
      confirmReset: "削除してリセット",
      quitDialogTitle: "KiboTalk を終了しますか？",
      quitDialogCopy: "進行中のセッションはありません。保存済みのデータには影響しません。",
      confirmQuit: "終了",
    },
    en: {
      settings: "Settings",
      stopped: "Stopped",
      active: "In session",
      general: "General",
      conversation: "Conversation",
      voiceprint: "Voiceprint",
      permissions: "Permissions",
      data: "Data & Privacy",
      about: "About",
      generalTitle: "General",
      generalDescription: "Interface, appearance, and launch behavior.",
      lockStopped: "The session is stopped. All settings can be changed and apply immediately.",
      lockActive: "In session: language, audio, and data actions are locked until you stop.",
      interfaceSection: "Interface",
      uiLanguage: "Interface language",
      uiLanguageDescription: "Also sets suggestion meanings for the next session. Changeable only while stopped.",
      theme: "Appearance",
      themeDescription: "Sticky notes stay bright yellow in dark mode.",
      system: "System",
      light: "Light",
      dark: "Dark",
      startupSection: "Launch",
      launchAtLogin: "Launch at login",
      launchDescription: "Desktop app only. Opens in the stopped state.",
      conversationTitle: "Conversation",
      conversationDescription: "These settings are frozen into a session snapshot when you start.",
      languageAndLevel: "Conversation language & level",
      languageLevelDescription: "Your last level is remembered separately for each language.",
      japanese: "Japanese",
      english: "English",
      chinese: "Chinese",
      beginner: "Beginner",
      intermediate: "Intermediate",
      advanced: "Advanced",
      audioSection: "Desktop audio",
      audioSource: "Audio source",
      audioSourceDescription: "Microphone and system audio remain separate streams; they are not mixed.",
      microphone: "Microphone",
      systemAudio: "System audio",
      bothAudio: "Microphone + system audio",
      microphoneDevice: "Microphone device",
      microphoneDeviceDescription: "Disconnecting it unexpectedly pauses the session and asks you to reselect.",
      systemDefault: "System Default",
      macbookMic: "MacBook Microphone",
      airpodsMic: "Lulu’s AirPods",
      usbMic: "USB Podcast Mic",
      headphonesHint: "When capturing both, headphones help prevent speaker bleed and duplicate transcripts.",
      voiceprintTitle: "Voiceprint",
      voiceprintDescription: "A voiceprint is required before starting any audio session.",
      voiceprintStatus: "Voiceprint enrolled",
      voiceprintStatusDescription: "Last recorded 3 days ago · Stored only on this device",
      rerecord: "Re-record",
      deleteVoiceprint: "Delete voiceprint",
      deleteVoiceprintDescription: "After deletion, you must enroll again before starting a session.",
      permissionsTitle: "Permissions",
      permissionsDescription: "Relevant system permissions and their current status are always shown.",
      micPermission: "Microphone",
      micPermissionDescription: "Used for in-person conversations and speaker verification.",
      screenPermission: "System audio / Screen Recording",
      screenPermissionDescription: "Used for the other person in desktop meetings and videos.",
      granted: "Allowed",
      openSystemSettings: "Open System Settings",
      dataTitle: "Data & Privacy",
      dataDescription: "Conversation text is stored locally; raw audio is not saved.",
      localDataSection: "Local data",
      clearHistory: "Clear conversation history",
      clearHistoryDescription: "Deletes text, suggestions, summaries, and session metadata.",
      clear: "Clear…",
      resetPersonal: "Clear personal data & reset",
      resetPersonalDescription: "Deletes preferences, voiceprint, and sessions. Cached speech capabilities remain.",
      reset: "Reset…",
      aboutTitle: "About",
      aboutDescription: "Version information and desktop app actions.",
      appSection: "KiboTalk",
      version: "Version",
      versionDescription: "Live Reply Coach",
      quitApp: "Quit KiboTalk",
      quitDescription: "Asks for confirmation. An active session is sealed and saved first.",
      quit: "Quit…",
      preparing: "Preparing speech capabilities",
      lockedShort: "Change after stopping",
      desktopOnly: "Desktop only",
      voiceDialogTitle: "Delete voiceprint?",
      voiceDialogCopy: "You won’t be able to start a session until you enroll again. Saved conversations are not deleted.",
      cancel: "Cancel",
      confirmDelete: "Delete voiceprint",
      resetDialogTitle: "Clear personal data and reset?",
      resetDialogCopy: "Preferences, voiceprint, and all sessions will be deleted from this device. Speech capability caches remain.",
      confirmReset: "Clear & reset",
      quitDialogTitle: "Quit KiboTalk?",
      quitDialogCopy: "There is no active session. Saved data will not be affected.",
      confirmQuit: "Quit",
    },
  };

  const t = (key) => `<span data-i18n="${key}">${SETTINGS_I18N.zh[key]}</span>`;
  const option = (value, key, selected = false) =>
    `<option value="${value}" data-i18n="${key}"${selected ? " selected" : ""}>${SETTINGS_I18N.zh[key]}</option>`;
  const selectMarkup = (name, options, locked = false) => `
    <span class="select-wrap locked-control"${locked ? " data-session-locked" : ""}>
      <select name="${name}">${options}</select>
      ${icon("chevron-down")}
    </span>`;

  const settingsSectionHeader = (titleKey, descriptionKey) => `
    <div class="settings-head">
      <div><h1>${t(titleKey)}</h1><p>${t(descriptionKey)}</p></div>
      <div class="settings-lock-note">${icon("lock", "icon-sm")}<span data-lock-copy>${SETTINGS_I18N.zh.lockStopped}</span></div>
    </div>`;

  const settingRow = ({
    labelKey,
    descriptionKey,
    control,
    className = "",
  }) => `
    <div class="setting-row ${className}">
      <div class="setting-copy">
        <div class="setting-label">${t(labelKey)}</div>
        <div class="setting-description">${t(descriptionKey)}</div>
      </div>
      <div class="setting-control">${control}</div>
    </div>`;

  const settingsMarkup = () => {
    const languageOptions = [
      option("ja", "japanese", true),
      option("en", "english"),
      option("zh", "chinese"),
    ].join("");
    const uiLanguageOptions = [
      option("zh", "chinese", true),
      option("ja", "japanese"),
      option("en", "english"),
    ].join("");
    const levelOptions = [
      option("beginner", "beginner", true),
      option("intermediate", "intermediate"),
      option("advanced", "advanced"),
    ].join("");

    const generalSection = `
      <section class="settings-section is-active" data-section="general">
        ${settingsSectionHeader("generalTitle", "generalDescription")}
        <p class="settings-section-title">${t("interfaceSection")}</p>
        <div class="settings-group">
          ${settingRow({
            labelKey: "uiLanguage",
            descriptionKey: "uiLanguageDescription",
            control: selectMarkup("uiLang", uiLanguageOptions, true),
          })}
          ${settingRow({
            labelKey: "theme",
            descriptionKey: "themeDescription",
            control: `
              <div class="segmented" data-theme-control>
                <button class="is-active" type="button" data-theme-value="system">${t("system")}</button>
                <button type="button" data-theme-value="light">${t("light")}</button>
                <button type="button" data-theme-value="dark">${t("dark")}</button>
              </div>`,
          })}
        </div>
        <p class="settings-section-title">${t("startupSection")}</p>
        <div class="settings-group">
          ${settingRow({
            labelKey: "launchAtLogin",
            descriptionKey: "launchDescription",
            control: `<span class="badge">${t("desktopOnly")}</span><button class="switch" type="button" data-toggle-switch aria-pressed="false"><span class="sr-only">Launch at login</span></button>`,
          })}
        </div>
      </section>`;

    const conversationSection = `
      <section class="settings-section" data-section="conversation">
        ${settingsSectionHeader("conversationTitle", "conversationDescription")}
        <p class="settings-section-title">${t("conversationTitle")}</p>
        <div class="settings-group">
          ${settingRow({
            labelKey: "languageAndLevel",
            descriptionKey: "languageLevelDescription",
            control: `${selectMarkup("conversationLang", languageOptions, true)}${selectMarkup("level", levelOptions, true)}`,
          })}
        </div>
        <p class="settings-section-title">${t("audioSection")}</p>
        <div class="settings-group">
          ${settingRow({
            labelKey: "audioSource",
            descriptionKey: "audioSourceDescription",
            control: selectMarkup(
              "audioSource",
              [option("microphone", "microphone"), option("system", "systemAudio"), option("both", "bothAudio", true)].join(""),
              true,
            ),
          })}
          ${settingRow({
            labelKey: "microphoneDevice",
            descriptionKey: "microphoneDeviceDescription",
            control: selectMarkup(
              "microphoneDevice",
              [option("default", "systemDefault", true), option("macbook", "macbookMic"), option("airpods", "airpodsMic"), option("usb", "usbMic")].join(""),
              true,
            ),
          })}
          <div class="setting-row">
            <div class="setting-copy">
              <div class="setting-label">${icon("headphones", "icon-sm")}${t("headphonesHint")}</div>
            </div>
          </div>
        </div>
      </section>`;

    const voiceprintSection = `
      <section class="settings-section" data-section="voiceprint">
        ${settingsSectionHeader("voiceprintTitle", "voiceprintDescription")}
        <p class="settings-section-title">${t("voiceprintTitle")}</p>
        <div class="settings-group">
          ${settingRow({
            labelKey: "voiceprintStatus",
            descriptionKey: "voiceprintStatusDescription",
            control: `<span class="permission-status">${icon("circle-check", "icon-sm")}${t("granted")}</span><button class="button button-secondary locked-control" type="button" data-session-locked>${t("rerecord")}</button>`,
          })}
          ${settingRow({
            labelKey: "deleteVoiceprint",
            descriptionKey: "deleteVoiceprintDescription",
            control: `<button class="button button-danger locked-control" type="button" data-session-locked data-open-dialog="voiceprint">${t("deleteVoiceprint")}</button>`,
            className: "settings-danger",
          })}
        </div>
      </section>`;

    const permissionSection = `
      <section class="settings-section" data-section="permissions">
        ${settingsSectionHeader("permissionsTitle", "permissionsDescription")}
        <p class="settings-section-title">${t("permissionsTitle")}</p>
        <div class="settings-group">
          ${settingRow({
            labelKey: "micPermission",
            descriptionKey: "micPermissionDescription",
            control: `<span class="permission-status">${icon("circle-check", "icon-sm")}${t("granted")}</span>`,
          })}
          ${settingRow({
            labelKey: "screenPermission",
            descriptionKey: "screenPermissionDescription",
            control: `<button class="button button-secondary" type="button" data-permission-action>${icon("circle-alert", "icon-sm")}${t("openSystemSettings")}</button>`,
          })}
        </div>
      </section>`;

    const dataSection = `
      <section class="settings-section" data-section="data">
        ${settingsSectionHeader("dataTitle", "dataDescription")}
        <p class="settings-section-title">${t("localDataSection")}</p>
        <div class="settings-group">
          ${settingRow({
            labelKey: "clearHistory",
            descriptionKey: "clearHistoryDescription",
            control: `<button class="button button-secondary locked-control" type="button" data-session-locked data-open-dialog="history">${t("clear")}</button>`,
          })}
          ${settingRow({
            labelKey: "resetPersonal",
            descriptionKey: "resetPersonalDescription",
            control: `<button class="button button-danger locked-control" type="button" data-session-locked data-open-dialog="reset">${t("reset")}</button>`,
            className: "settings-danger",
          })}
        </div>
      </section>`;

    const aboutSection = `
      <section class="settings-section" data-section="about">
        ${settingsSectionHeader("aboutTitle", "aboutDescription")}
        <p class="settings-section-title">${t("appSection")}</p>
        <div class="settings-group">
          ${settingRow({
            labelKey: "version",
            descriptionKey: "versionDescription",
            control: '<span class="badge badge-neutral">0.1.0 MVP</span>',
          })}
          ${settingRow({
            labelKey: "quitApp",
            descriptionKey: "quitDescription",
            control: `<button class="button button-danger" type="button" data-open-dialog="quit">${t("quit")}</button>`,
            className: "settings-danger",
          })}
        </div>
      </section>`;

    const navItems = [
      ["general", "palette", "general"],
      ["conversation", "mic", "conversation"],
      ["voiceprint", "fingerprint", "voiceprint"],
      ["permissions", "shield-check", "permissions"],
      ["data", "database", "data"],
      ["about", "info", "about"],
    ]
      .map(
        ([section, iconName, key], index) => `
          <button class="${index === 0 ? "is-active" : ""}" type="button" data-nav-section="${section}">
            ${icon(iconName, "icon-sm")}<span class="nav-label">${t(key)}</span>
          </button>`,
      )
      .join("");

    return `
      ${labBarMarkup("设置 · i18n 与会话锁定")}
      <div class="prototype-page">
        <div class="preview-shell settings-preview" data-preview-shell>
          <div class="preview-scroll">
            <div class="settings-app" data-settings-app>
              <div class="settings-window panel">
                <aside class="settings-sidebar">
                  <div class="settings-brand">
                    <img src="./assets/kibotalk-mark.svg" alt="KiboTalk" />
                    <div class="settings-state-demo" aria-label="原型会话状态">
                      <button class="is-active" type="button" data-session-demo="stopped">${t("stopped")}</button>
                      <button type="button" data-session-demo="active">${t("active")}</button>
                    </div>
                  </div>
                  <nav class="settings-nav" aria-label="设置分类">${navItems}</nav>
                </aside>
                <main class="settings-main">
                  <div class="model-prep">${icon("rotate-ccw", "icon-sm")}<span>${t("preparing")} 68%</span><span class="prep-track"><span></span></span></div>
                  <div style="height:14px"></div>
                  ${generalSection}
                  ${conversationSection}
                  ${voiceprintSection}
                  ${permissionSection}
                  ${dataSection}
                  ${aboutSection}
                </main>
              </div>
            </div>
          </div>
        </div>
      </div>
      ${settingsDialogMarkup("voiceprint", "voiceDialogTitle", "voiceDialogCopy", "confirmDelete")}
      ${settingsDialogMarkup("history", "clearHistory", "clearHistoryDescription", "clear")}
      ${settingsDialogMarkup("reset", "resetDialogTitle", "resetDialogCopy", "confirmReset")}
      ${settingsDialogMarkup("quit", "quitDialogTitle", "quitDialogCopy", "confirmQuit")}
      <div class="toast" role="status" aria-live="polite" data-toast></div>`;
  };

  function settingsDialogMarkup(name, titleKey, copyKey, confirmKey) {
    return `
      <div class="dialog-backdrop" data-dialog="${name}" role="dialog" aria-modal="true">
        <div class="dialog-card panel">
          <h2>${t(titleKey)}</h2>
          <p>${t(copyKey)}</p>
          <div class="dialog-actions">
            <button class="button button-plain" type="button" data-dialog-close>${t("cancel")}</button>
            <button class="button button-danger" type="button" data-dialog-confirm="${name}">${t(confirmKey)}</button>
          </div>
        </div>
      </div>`;
  }

  const applySettingsLanguage = (language) => {
    const dictionary = SETTINGS_I18N[language] || SETTINGS_I18N.zh;
    const documentLanguages = { en: "en", ja: "ja-JP", zh: "zh-CN" };
    document.documentElement.lang = documentLanguages[language] || "zh-CN";
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const value = dictionary[element.dataset.i18n];
      if (value) element.textContent = value;
    });
    const settingsApp = document.querySelector("[data-settings-app]");
    const lockCopy = document.querySelectorAll("[data-lock-copy]");
    const active = settingsApp?.classList.contains("is-active-session");
    lockCopy.forEach((element) => {
      element.textContent = dictionary[active ? "lockActive" : "lockStopped"];
    });
  };

  const setupSettingsInteractions = () => {
    setupLabBar();
    const app = document.querySelector("[data-settings-app]");
    let language = "zh";

    document.querySelectorAll("[data-nav-section]").forEach((button) => {
      button.addEventListener("click", () => {
        const section = button.dataset.navSection;
        document.querySelectorAll("[data-nav-section]").forEach((item) => {
          item.classList.toggle("is-active", item === button);
        });
        document.querySelectorAll("[data-section]").forEach((panel) => {
          panel.classList.toggle("is-active", panel.dataset.section === section);
        });
      });
    });

    const setActiveSession = (active) => {
      app?.classList.toggle("is-active-session", active);
      document.querySelectorAll("[data-session-demo]").forEach((button) => {
        button.classList.toggle(
          "is-active",
          button.dataset.sessionDemo === (active ? "active" : "stopped"),
        );
      });
      document
        .querySelectorAll("select[name='uiLang'], select[name='conversationLang'], select[name='level'], select[name='audioSource'], select[name='microphoneDevice']")
        .forEach((select) => {
          select.disabled = active;
        });
      applySettingsLanguage(language);
      showToast(
        active
          ? SETTINGS_I18N[language].lockActive
          : SETTINGS_I18N[language].lockStopped,
      );
    };

    document.querySelectorAll("[data-session-demo]").forEach((button) => {
      button.addEventListener("click", () =>
        setActiveSession(button.dataset.sessionDemo === "active"),
      );
    });

    document.querySelector("select[name='uiLang']")?.addEventListener("change", (event) => {
      language = event.target.value;
      applySettingsLanguage(language);
      const messages = {
        en: "Interface language changed",
        ja: "表示言語を変更しました",
        zh: "界面语言已立即切换",
      };
      showToast(messages[language] || messages.zh);
    });

    document.querySelectorAll("[data-theme-value]").forEach((button) => {
      button.addEventListener("click", () => {
        const theme = button.dataset.themeValue;
        document.querySelectorAll("[data-theme-value]").forEach((item) => {
          item.classList.toggle("is-active", item === button);
        });
        const dark =
          theme === "dark" ||
          (theme === "system" &&
            window.matchMedia("(prefers-color-scheme: dark)").matches);
        const shell = document.querySelector("[data-preview-shell]");
        if (shell) {
          if (dark) shell.dataset.theme = "dark";
          else delete shell.dataset.theme;
        }
      });
    });

    document.querySelectorAll("[data-toggle-switch]").forEach((button) => {
      button.addEventListener("click", () => {
        const on = !button.classList.contains("is-on");
        button.classList.toggle("is-on", on);
        button.setAttribute("aria-pressed", String(on));
      });
    });

    document.querySelector("[data-permission-action]")?.addEventListener(
      "click",
      () => {
        const messages = {
          en: "Prototype: opens Screen Recording in System Settings",
          ja: "プロトタイプ：画面収録のシステム設定を開きます",
          zh: "原型：将打开系统的屏幕录制权限页",
        };
        showToast(messages[language] || messages.zh);
      },
    );

    document.querySelectorAll("[data-open-dialog]").forEach((button) => {
      button.addEventListener("click", () =>
        setDialog(button.dataset.openDialog, true),
      );
    });
    document.querySelectorAll("[data-dialog-close]").forEach((button) => {
      button.addEventListener("click", () =>
        button.closest(".dialog-backdrop")?.classList.remove("is-open"),
      );
    });
    document.querySelectorAll("[data-dialog-confirm]").forEach((button) => {
      button.addEventListener("click", () => {
        button.closest(".dialog-backdrop")?.classList.remove("is-open");
        const messages = {
          en: "Prototype action confirmed",
          ja: "操作を確認しました",
          zh: "原型操作已确认",
        };
        showToast(messages[language] || messages.zh);
      });
    });

    applySettingsLanguage(language);
  };

  const render = () => {
    const root = document.querySelector("#prototype-root");
    if (!root) return;
    const prototype = document.body.dataset.prototype;
    if (prototype?.startsWith("web-")) {
      root.innerHTML = webMarkup(prototype.replace("web-", ""));
      hydrateIcons();
      setupWebInteractions();
      return;
    }
    if (prototype === "desktop-floating") {
      root.innerHTML = desktopMarkup();
      hydrateIcons();
      setupDesktopInteractions();
      return;
    }
    if (prototype === "settings") {
      root.innerHTML = settingsMarkup();
      hydrateIcons();
      setupSettingsInteractions();
    }
  };

  render();
})();
