// sample-data.js - Preloaded Demonstration Note for Shakt
// Features English, Hinglish, Hindi text and high-res diagram canvas

window.SHAKT_SAMPLE_NOTE = {
  id: 'sample_physics_note',
  name: 'Physics: Newton Laws & Friction (Eng + Hinglish + Hindi).pdf',
  totalPages: 3,
  lastOpenedPage: 1,
  blocks: [
    {
      id: 'b1',
      type: 'heading',
      text: 'Chapter 4: Friction & Free Body Diagram (घर्षण एवं FBD)',
      fontSize: 'xl',
      spacingBottom: 16
    },
    {
      id: 'b2',
      type: 'subheading',
      text: '1. Basic Concept & Definition (मूल अवधारणा)',
      fontSize: 'lg',
      spacingBottom: 12
    },
    {
      id: 'b3',
      type: 'paragraph',
      text: 'Friction ek opposing force hai jo tab act karta hai jab do surfaces relative motion ya sliding tend karte hain. Jab tak external force static friction se kam hai, object move nahi karega.\n\nघर्षण वह विरोधी बल है जो दो सतहों के बीच आपेक्षिक गति (relative motion) का विरोध करता है।',
      fontSize: 'md',
      spacingBottom: 20
    },
    {
      id: 'b4',
      type: 'diagram',
      title: 'Free Body Diagram (FBD) of Block on Rough Inclined Plane',
      caption: 'Normal force N = mg cos(θ), Downward component = mg sin(θ), Friction force f = μN',
      spacingBottom: 24,
      // Inline clean SVG diagram converted to data URL
      imageUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 280" width="500" height="280"><rect width="500" height="280" fill="%231E293B" rx="12"/><path d="M 60 220 L 440 220 L 440 80 Z" fill="%23334155" stroke="%2364748B" stroke-width="3"/><rect x="220" y="105" width="80" height="50" transform="rotate(-23 260 130)" fill="%236366F1" rx="4" stroke="%23A5B4FC" stroke-width="2"/><line x1="260" y1="130" x2="260" y2="200" stroke="%23EF4444" stroke-width="3" marker-end="url(%23arrow)"/><text x="270" y="195" fill="%23EF4444" font-size="14" font-family="sans-serif">mg</text><line x1="260" y1="130" x2="230" y2="60" stroke="%2310B981" stroke-width="3"/><text x="210" y="55" fill="%2310B981" font-size="14" font-family="sans-serif">N</text><line x1="260" y1="130" x2="330" y2="100" stroke="%23F59E0B" stroke-width="3"/><text x="335" y="95" fill="%23F59E0B" font-size="14" font-family="sans-serif">f = μN</text><text x="120" y="210" fill="%2338BDF8" font-size="16" font-family="sans-serif">θ = 30°</text></svg>'
    },
    {
      id: 'b5',
      type: 'realisation',
      text: '💡 Key Realisation (महत्वपूर्ण सीख):\n"Friction kabhi motion ko oppose nahi karta, balki hamesha RELATIVE SLIDING ko oppose karta hai! For example, chalte waqt road hamare pairo par forward direction me friction lagati hai."',
      fontSize: 'md',
      spacingBottom: 20
    },
    {
      id: 'b6',
      type: 'formula',
      text: 'f_{max} = \\mu_s \\cdot N = \\mu_s \\cdot mg \\cos(\\theta)\na = g(\\sin\\theta - \\mu_k \\cos\\theta)',
      fontSize: 'md',
      spacingBottom: 24
    },
    {
      id: 'b7',
      type: 'paragraph',
      text: 'Agar angle of inclination (θ) angle of repose se zyada ho jaye, toh block automatically slide karne lagega without any external push.',
      fontSize: 'md',
      spacingBottom: 16
    }
  ],
  sampleDoubts: [
    {
      role: 'user',
      content: 'Bhaiya, agar incline plane smooth ho jaye to acceleration kitna hoga?'
    },
    {
      role: 'assistant',
      content: 'Bahut badhiya sawal! Agar surface perfectly smooth hai, toh coefficient of friction μ = 0 ho jayega.\n\nFormula me rakho:\n`a = g(sin θ - μ cos θ)`\n`a = g(sin θ - 0)`\n`a = g sin θ`\n\nIska matlab mass chahe 1 kg ho ya 100 kg, dono same acceleration `g sin θ` se neeche slip karenge!',
      isRealisation: true
    }
  ]
};
