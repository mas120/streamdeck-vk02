// =====================================================================
// FOREST TREE SVG LIBRARY - 4 giai đoạn cây inline
// =====================================================================

export const TREE_SVGS = {
  // 0-30%: mầm non, thân mảnh, tán nhỏ nhưng có lớp lá rõ
  sprout: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 78C50 78 49 70 50 64C51 58 54 55 50 52C46 49 45 61 45 64C45 68 47 72 50 78Z" fill="#7b4d2d"/>
    <path d="M50 64C46 62 42 60 39 57C36 54 35 50 38 48C41 45 46 47 49 50L50 64Z" fill="#7b4d2d" opacity="0.92"/>
    <path d="M50 64C54 62 59 60 62 57C65 54 66 50 63 48C60 45 56 47 52 50L50 64Z" fill="#7b4d2d" opacity="0.92"/>
    <ellipse cx="50" cy="51" rx="9" ry="8" fill="#7bcf64"/>
    <ellipse cx="42" cy="55" rx="7" ry="6" fill="#96dc7a"/>
    <ellipse cx="58" cy="56" rx="7.2" ry="6" fill="#96dc7a"/>
    <ellipse cx="50" cy="45" rx="7" ry="6" fill="#afdf8b"/>
  </svg>`,

  // 31-80%: cây đang phát triển, thân rõ và tán có nhiều tầng
  growing: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 82C50 82 49 72 50 65C51 57 53 51 50 46C47 41 44 42 44 49C44 57 47 63 50 82Z" fill="#7a4d2d"/>
    <path d="M50 58C45 56 39 54 35 50C31 46 30 41 35 38C40 35 46 38 49 43L50 58Z" fill="#7a4d2d" opacity="0.9"/>
    <path d="M50 58C55 56 61 54 65 50C69 46 70 41 65 38C60 35 54 38 51 43L50 58Z" fill="#7a4d2d" opacity="0.9"/>
    <path d="M50 48C48 44 45 40 48 36C51 32 55 35 57 38C59 42 57 46 50 48Z" fill="#7a4d2d" opacity="0.8"/>

    <ellipse cx="32" cy="46" rx="13" ry="11" fill="#5fa240"/>
    <ellipse cx="49" cy="35" rx="17" ry="14" fill="#6bbd4d"/>
    <ellipse cx="60" cy="47" rx="15" ry="12" fill="#79c95d"/>
    <ellipse cx="51" cy="24" rx="12" ry="10" fill="#8ad86d"/>
    <ellipse cx="39" cy="57" rx="10" ry="8" fill="#8cca68"/>
    <ellipse cx="61" cy="58" rx="10" ry="8" fill="#8cca68"/>
    <ellipse cx="50" cy="42" rx="8" ry="7" fill="#a5e186"/>
  </svg>`,

  // 81-100%: cây trưởng thành kiểu Forest app, tán rộng và đều, thân khỏe
  full: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 82C50 82 48 72 50 64C52 56 54 50 50 45C46 40 44 41 44 49C44 57 46 68 50 82Z" fill="#73462a"/>
    <path d="M50 60C45 58 39 56 34 51C29 46 29 40 34 36C39 32 46 35 49 40L50 60Z" fill="#73462a" opacity="0.95"/>
    <path d="M50 60C55 58 61 56 66 51C71 46 71 40 66 36C61 32 54 35 51 40L50 60Z" fill="#73462a" opacity="0.95"/>
    <path d="M50 48C47 42 42 37 46 30C50 23 57 28 60 35C62 40 59 46 50 48Z" fill="#73462a" opacity="0.9"/>

    <ellipse cx="50" cy="23" rx="17" ry="15" fill="#85d260"/>
    <ellipse cx="36" cy="38" rx="17" ry="14" fill="#72b84d"/>
    <ellipse cx="63" cy="39" rx="17" ry="14" fill="#77c352"/>
    <ellipse cx="50" cy="46" rx="22" ry="16" fill="#8ed869"/>
    <ellipse cx="30" cy="53" rx="12" ry="10" fill="#7cc558"/>
    <ellipse cx="70" cy="53" rx="12" ry="10" fill="#7cc558"/>
    <ellipse cx="42" cy="31" rx="9" ry="8" fill="#b0e785"/>
    <ellipse cx="58" cy="31" rx="9" ry="8" fill="#b0e785"/>
    <ellipse cx="50" cy="34" rx="7.5" ry="7" fill="#d0f3a7" opacity="0.9"/>

    <circle cx="47" cy="17" r="3" fill="#f7e38a"/>
    <circle cx="54" cy="17" r="2.6" fill="#f8efaf"/>
  </svg>`,

  // Cây chết / gãy, lá xám, thân khô rõ hơn
  dead: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 82C49 76 49 69 50 62C51 55 53 50 50 46C47 42 44 43 44 50C44 57 46 68 50 82Z" fill="#5d504d"/>
    <path d="M50 58C45 56 39 54 35 50C31 46 31 41 35 38C39 35 45 37 49 41L50 58Z" fill="#5d504d" opacity="0.8"/>
    <path d="M50 58C55 56 61 54 65 50C69 46 69 41 65 38C61 35 55 37 51 41L50 58Z" fill="#5d504d" opacity="0.8"/>
    <path d="M50 48C47 43 43 38 46 32C49 26 56 30 59 35C61 39 58 44 50 48Z" fill="#5d504d" opacity="0.7"/>

    <ellipse cx="33" cy="47" rx="13" ry="11" fill="#8a827d" opacity="0.7"/>
    <ellipse cx="49" cy="35" rx="16" ry="13" fill="#7a7570" opacity="0.75"/>
    <ellipse cx="61" cy="47" rx="14" ry="11" fill="#8b837d" opacity="0.72"/>
    <ellipse cx="50" cy="24" rx="12" ry="10" fill="#9a938b" opacity="0.58"/>
    <ellipse cx="39" cy="57" rx="9" ry="7" fill="#8e8781" opacity="0.7"/>
    <ellipse cx="60" cy="58" rx="9" ry="7" fill="#8e8781" opacity="0.7"/>
  </svg>`
};
