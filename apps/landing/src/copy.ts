export const locales = ['zh', 'ja', 'en'] as const

export type Locale = (typeof locales)[number]

type Scenario = {
  title: string
  detail: string
  image: string
  imageAlt: string
}

type LandingCopy = {
  localeName: string
  nav: {
    scenes: string
    product: string
    story: string
    mission: string
  }
  actions: {
    web: string
    mac: string
    lite: string
    top: string
  }
  hero: {
    eyebrow: string
    titleLead: string
    titleMark: string
    statementLead: string
    statementStrong: string
    tagline: string
    webNote: string
    macNote: string
  }
  scenes: {
    eyebrow: string
    titleLead: string
    titleMark: string
    ariaLabel: string
    items: Scenario[]
  }
  product: {
    eyebrow: string
    titleLead: string
    titleMark: string
    body: string
    transcriptSpeaker: string
    transcript: string
    suggestionLabel: string
    now: string
    listening: string
    candidates: Array<{
      targetText: string
      meaning: string
      reading?: string
    }>
  }
  story: {
    eyebrow: string
    title: string
    body: string
    liteLabel: string
    liteTitle: string
    liteBody: string
    productionLabel: string
    productionTitle: string
    productionBody: string
    steps: string[]
    capabilities: string[]
  }
  mission: {
    eyebrow: string
    titleLead: string
    titleMark: string
    body: string
    compatibility: string
    gatekeeper: string
  }
  footer: {
    statement: string
    original: string
    release: string
  }
}

const assets = {
  convenience: '/assets/card-convenience.jpg',
  clinic: '/assets/card-clinic.jpg',
  rent: '/assets/card-rent.jpg',
  bank: '/assets/card-bank.jpg',
  restaurant: '/assets/card-restaurant.jpg',
}

export const copy: Record<Locale, LandingCopy> = {
  zh: {
    localeName: '中文',
    nav: {
      scenes: '真实场景',
      product: '如何工作',
      story: '开发故事',
      mission: '我们的使命',
    },
    actions: {
      web: '立即体验 Web 版',
      mac: '下载 macOS 版',
      lite: '体验最初的闪应用',
      top: '回到顶部',
    },
    hero: {
      eyebrow: 'REAL LIFE, REAL VOICE',
      titleLead: '听懂了，',
      titleMark: '却答不上来？',
      statementLead: '翻译让你听懂，',
      statementStrong: 'KiboTalk 让你答得上来。',
      tagline: 'AI 提示，你开口。',
      webNote: '浏览器直接使用 · 支持 PWA',
      macNote: 'Apple Silicon · macOS 13+',
    },
    scenes: {
      eyebrow: 'REAL LIFE, REAL VOICE',
      titleLead: '每一次开口，',
      titleMark: '都在真实世界。',
      ariaLabel: '日本真实生活场景地图',
      items: [
        {
          title: '便利店兼职',
          detail: 'コンビニのアルバイト',
          image: assets.convenience,
          imageAlt: '日本便利店',
        },
        {
          title: '就医问诊',
          detail: '診察を受ける',
          image: assets.clinic,
          imageAlt: '日本医院',
        },
        {
          title: '租房签约',
          detail: '賃貸物件の契約',
          image: assets.rent,
          imageAlt: '日本公寓',
        },
        {
          title: '银行业务',
          detail: '銀行業務の手続き',
          image: assets.bank,
          imageAlt: '日本银行',
        },
        {
          title: '餐厅点餐',
          detail: 'レストランでの注文',
          image: assets.restaurant,
          imageAlt: '日本餐厅',
        },
      ],
    },
    product: {
      eyebrow: 'THE SOLUTION',
      titleLead: 'AI 给提示，',
      titleMark: '你自己开口。',
      body: 'KiboTalk 听取真实对话，在你卡壳时给出三句贴合语境的表达。选择权与声音始终属于你。',
      transcriptSpeaker: '我',
      transcript: '「すみません、それは……」',
      suggestionLabel: '本轮建议',
      now: '刚刚',
      listening: '转写中',
      candidates: [
        {
          targetText: 'すみません、それはいくらですか？',
          meaning: '不好意思，那个多少钱？',
          reading: 'Sumimasen, sore wa ikura desu ka?',
        },
        {
          targetText: 'はい、お願いします。',
          meaning: '好的，麻烦您了。',
          reading: 'Hai, onegai shimasu.',
        },
        {
          targetText: '少々お待ちください。',
          meaning: '请稍等一下。',
          reading: 'Shōshō omachi kudasai.',
        },
      ],
    },
    story: {
      eyebrow: 'FROM VALIDATION TO PRODUCTION',
      title: '一句话做出原型，然后把它做成真正可用的产品。',
      body: 'KiboTalk Lite 在灵光上快速验证了一个判断：人们缺的往往不是翻译，而是对话现场能说出口的下一句。验证成立后，我们开始为真实世界补齐生产级能力。',
      liteLabel: '最初的验证',
      liteTitle: 'KiboTalk Lite',
      liteBody: '用一句话创建的灵光闪应用，让核心交互在最短时间里接受真实反馈。',
      productionLabel: '现在的产品',
      productionTitle: 'KiboTalk 自研栈',
      productionBody: '从端侧音频判断到多端会话同步，把一次灵感变成可以长期使用的产品。',
      steps: ['一句话生成闪应用', '验证“听懂却答不上来”的真实需求', '转向生产级多端自研'],
      capabilities: ['端侧语音活动检测', '声纹验证', '实时转写', '加密会话同步', '账号与额度', 'Web / PWA / 桌面端'],
    },
    mission: {
      eyebrow: 'READY FOR THE REAL CONVERSATION',
      titleLead: '下一次卡壳前，',
      titleMark: '让 KiboTalk 在场。',
      body: '我们希望技术退到背景，让每个人在真实世界的对话里，都能更从容地说出下一句。',
      compatibility: '桌面版支持 Apple Silicon、macOS 13 及以上版本。',
      gatekeeper: '当前版本为未公证测试版，首次打开需在系统“隐私与安全性”中确认。',
    },
    footer: {
      statement: 'AI 提示，你开口。',
      original: '灵光闪应用',
      release: 'GitHub Releases',
    },
  },
  ja: {
    localeName: '日本語',
    nav: {
      scenes: 'リアルな場面',
      product: '使い方',
      story: '開発ストーリー',
      mission: '私たちの使命',
    },
    actions: {
      web: 'Web版を試す',
      mac: 'macOS版をダウンロード',
      lite: '最初のFlash Appを試す',
      top: 'ページ上部へ',
    },
    hero: {
      eyebrow: 'REAL LIFE, REAL VOICE',
      titleLead: '聞き取れた。',
      titleMark: 'なのに、返せない？',
      statementLead: '翻訳は理解を助ける。',
      statementStrong: 'KiboTalkは返事を助ける。',
      tagline: 'AIがヒントを。話すのは、あなた。',
      webNote: 'ブラウザですぐ使える · PWA対応',
      macNote: 'Apple Silicon · macOS 13以降',
    },
    scenes: {
      eyebrow: 'REAL LIFE, REAL VOICE',
      titleLead: '話すたびに、',
      titleMark: 'そこは本当の世界。',
      ariaLabel: '日本でのリアルな生活場面',
      items: [
        {
          title: 'コンビニのアルバイト',
          detail: 'Working at a convenience store',
          image: assets.convenience,
          imageAlt: '日本のコンビニ',
        },
        {
          title: '病院での診察',
          detail: 'Seeing a doctor',
          image: assets.clinic,
          imageAlt: '日本の病院',
        },
        {
          title: '賃貸契約',
          detail: 'Signing a lease',
          image: assets.rent,
          imageAlt: '日本の賃貸住宅',
        },
        {
          title: '銀行での手続き',
          detail: 'Banking in person',
          image: assets.bank,
          imageAlt: '日本の銀行',
        },
        {
          title: 'レストランで注文',
          detail: 'Ordering at a restaurant',
          image: assets.restaurant,
          imageAlt: '日本のレストラン',
        },
      ],
    },
    product: {
      eyebrow: 'THE SOLUTION',
      titleLead: 'AIがヒントを。',
      titleMark: '話すのは、あなた。',
      body: 'KiboTalkは実際の会話を聞き、言葉に詰まった瞬間に、その場に合う3つの表現を提案します。選ぶのも、声にするのもあなたです。',
      transcriptSpeaker: '自分',
      transcript: '「すみません、それは……」',
      suggestionLabel: '今回の提案',
      now: 'たった今',
      listening: '文字起こし中',
      candidates: [
        {
          targetText: 'すみません、それはいくらですか？',
          meaning: 'Excuse me, how much is that?',
          reading: 'Sumimasen, sore wa ikura desu ka?',
        },
        {
          targetText: 'はい、お願いします。',
          meaning: 'Yes, please.',
          reading: 'Hai, onegai shimasu.',
        },
        {
          targetText: '少々お待ちください。',
          meaning: 'Please wait a moment.',
          reading: 'Shōshō omachi kudasai.',
        },
      ],
    },
    story: {
      eyebrow: 'FROM VALIDATION TO PRODUCTION',
      title: '一言でプロトタイプを作り、実世界で使えるプロダクトへ。',
      body: 'KiboTalk Liteは、灵光で素早く仮説を検証しました。必要なのは翻訳だけではなく、会話の現場で口にできる「次の一言」。手応えを得たあと、本番運用に必要な基盤を自分たちで作り始めました。',
      liteLabel: '最初の検証',
      liteTitle: 'KiboTalk Lite',
      liteBody: '一言から生まれた灵光のFlash Appで、コア体験を最短距離でユーザーに届けました。',
      productionLabel: '現在のプロダクト',
      productionTitle: 'KiboTalk 自社開発スタック',
      productionBody: '端末上の音声処理からマルチデバイス同期まで、ひらめきを長く使えるプロダクトへ。',
      steps: ['一言からFlash Appを生成', '「分かるのに返せない」課題を検証', '本番品質のマルチデバイス開発へ'],
      capabilities: ['端末上の音声区間検出', '話者照合', 'リアルタイム文字起こし', '暗号化された会話同期', 'アカウントと利用枠', 'Web / PWA / デスクトップ'],
    },
    mission: {
      eyebrow: 'READY FOR THE REAL CONVERSATION',
      titleLead: '次に言葉に詰まる前に、',
      titleMark: 'KiboTalkをそばに。',
      body: 'テクノロジーは背景へ。誰もが現実の会話で、次の一言をもっと自然に口にできる世界を目指します。',
      compatibility: 'デスクトップ版はApple Silicon、macOS 13以降に対応しています。',
      gatekeeper: '現在は未公証のテスト版です。初回起動時に「プライバシーとセキュリティ」で許可してください。',
    },
    footer: {
      statement: 'AIがヒントを。話すのは、あなた。',
      original: '灵光 Flash App',
      release: 'GitHub Releases',
    },
  },
  en: {
    localeName: 'English',
    nav: {
      scenes: 'Real moments',
      product: 'How it works',
      story: 'Our build story',
      mission: 'Our mission',
    },
    actions: {
      web: 'Try the Web app',
      mac: 'Download for macOS',
      lite: 'Try the original Flash App',
      top: 'Back to top',
    },
    hero: {
      eyebrow: 'REAL LIFE, REAL VOICE',
      titleLead: 'You understood.',
      titleMark: "But couldn't reply?",
      statementLead: 'Translation helps you understand. ',
      statementStrong: 'KiboTalk helps you answer.',
      tagline: 'AI gives the cue. You speak.',
      webNote: 'Runs in your browser · PWA ready',
      macNote: 'Apple Silicon · macOS 13+',
    },
    scenes: {
      eyebrow: 'REAL LIFE, REAL VOICE',
      titleLead: 'Every time you speak,',
      titleMark: "it's in the real world.",
      ariaLabel: 'Map of real-life situations in Japan',
      items: [
        {
          title: 'Convenience-store shift',
          detail: 'コンビニのアルバイト',
          image: assets.convenience,
          imageAlt: 'Convenience store in Japan',
        },
        {
          title: "Doctor's appointment",
          detail: '診察を受ける',
          image: assets.clinic,
          imageAlt: 'Clinic in Japan',
        },
        {
          title: 'Signing a lease',
          detail: '賃貸物件の契約',
          image: assets.rent,
          imageAlt: 'Apartment building in Japan',
        },
        {
          title: 'Banking in person',
          detail: '銀行業務の手続き',
          image: assets.bank,
          imageAlt: 'Bank in Japan',
        },
        {
          title: 'Ordering a meal',
          detail: 'レストランでの注文',
          image: assets.restaurant,
          imageAlt: 'Restaurant in Japan',
        },
      ],
    },
    product: {
      eyebrow: 'THE SOLUTION',
      titleLead: 'AI gives the cue. ',
      titleMark: 'You say it yourself.',
      body: 'KiboTalk listens to the real conversation and offers three natural replies when you get stuck. The choice—and the voice—stay yours.',
      transcriptSpeaker: 'You',
      transcript: '「すみません、それは……」',
      suggestionLabel: 'Reply ideas',
      now: 'Just now',
      listening: 'Transcribing',
      candidates: [
        {
          targetText: 'すみません、それはいくらですか？',
          meaning: 'Excuse me, how much is that?',
          reading: 'Sumimasen, sore wa ikura desu ka?',
        },
        {
          targetText: 'はい、お願いします。',
          meaning: 'Yes, please.',
          reading: 'Hai, onegai shimasu.',
        },
        {
          targetText: '少々お待ちください。',
          meaning: 'Please wait a moment.',
          reading: 'Shōshō omachi kudasai.',
        },
      ],
    },
    story: {
      eyebrow: 'FROM VALIDATION TO PRODUCTION',
      title: 'One sentence made the prototype. Then we built the product for real life.',
      body: 'KiboTalk Lite, created on Lingguang, let us validate one idea quickly: people often need more than translation—they need the next sentence they can actually say. Once that proved true, we started building the production foundation ourselves.',
      liteLabel: 'The first validation',
      liteTitle: 'KiboTalk Lite',
      liteBody: 'A Lingguang Flash App created from one sentence put the core interaction in front of real people, fast.',
      productionLabel: 'The product today',
      productionTitle: 'The KiboTalk stack',
      productionBody: 'From on-device audio decisions to cross-device conversation sync, we are turning the spark into a product people can rely on.',
      steps: ['Create a Flash App from one sentence', 'Validate the “understood but could not reply” moment', 'Build the production-grade, multi-device product'],
      capabilities: ['On-device voice activity detection', 'Speaker verification', 'Live transcription', 'Encrypted conversation sync', 'Accounts and usage allowance', 'Web / PWA / desktop'],
    },
    mission: {
      eyebrow: 'READY FOR THE REAL CONVERSATION',
      titleLead: 'Before the next stuck moment,',
      titleMark: 'have KiboTalk there.',
      body: 'We want the technology to fade into the background, so anyone can say the next thing with more confidence in a real conversation.',
      compatibility: 'The desktop app supports Apple Silicon and macOS 13 or later.',
      gatekeeper: 'This is currently an unnotarized test build. On first launch, approve it in Privacy & Security.',
    },
    footer: {
      statement: 'AI gives the cue. You speak.',
      original: 'Lingguang Flash App',
      release: 'GitHub Releases',
    },
  },
}

export function localeFromPath(pathname: string): Locale {
  const segment = pathname.split('/').filter(Boolean)[0]
  return locales.includes(segment as Locale) ? (segment as Locale) : 'en'
}
