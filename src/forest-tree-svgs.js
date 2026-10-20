// =====================================================================
// FOREST TREE SVG LIBRARY - 5 giai đoạn cây inline
// =====================================================================

export const TREE_SVGS = {
  // 0-5%: hạt nằm trong đất, rễ bắt đầu tách và chồi vừa nhú lên
  seed: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="91" rx="29" ry="5" fill="#9A7548" opacity="0.42"/>
    <path d="M23 78C28 72 38 72 50 75C62 78 72 72 77 77C74 85 64 89 50 89C37 89 27 85 23 78Z" fill="#A9774C"/>
    <path d="M25 77C32 73 40 74 50 76C61 78 69 73 75 76" stroke="#708B4D" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M39 78C39 73 44 70 50 71C56 70 61 73 61 78C61 82 56 85 50 85C44 85 39 82 39 78Z" fill="#8A5735"/>
    <path d="M42 77C44 74 48 73 51 74" stroke="#C28A53" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M50 82C50 86 49 88 47 90M51 83C53 86 55 87 57 88" stroke="#6F482F" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M50 71C48 66 49 61 51 57C52 54 54 52 55 49" stroke="#57914B" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M51 62C46 61 43 58 43 55C47 54 50 56 52 60Z" fill="#83C95D"/>
    <path d="M52 57C53 53 57 51 60 52C60 56 57 59 52 61Z" fill="#A2D96A"/>
    <path d="M44 56L48 58M56 55L53 58" stroke="#D2EE91" stroke-width="1.5" stroke-linecap="round" opacity="0.8"/>
  </svg>`,

  // 6-30%: chồi non vừa vươn lên với hai lá đầu tiên
  sprout: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="91" rx="29" ry="5" fill="#9A7548" opacity="0.4"/>
    <path d="M22 80C28 74 39 75 50 78C62 80 72 74 78 78C74 85 64 89 50 89C36 89 26 86 22 80Z" fill="#A9774C"/>
    <path d="M25 79C32 75 40 76 50 79C61 81 69 75 75 78" stroke="#708B4D" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M50 78C48 68 50 60 50 52C50 44 47 38 43 34M50 59C54 51 59 47 64 43" stroke="#80502F" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M48 57C39 56 29 51 24 44C20 38 23 33 29 32C37 31 45 40 50 52C52 42 60 33 69 33C76 34 79 39 75 45C70 52 60 56 51 58C55 48 54 39 51 30C49 24 44 23 40 27C36 32 40 45 48 57Z" fill="#55A64E"/>
    <path d="M25 43C24 38 27 35 31 35C37 35 43 42 47 50C39 48 30 46 25 43Z" fill="#83CE63"/>
    <path d="M55 51C60 42 66 37 71 37C75 37 76 40 73 44C68 49 61 51 55 53Z" fill="#9BDC70"/>
    <path d="M44 32C45 28 48 27 51 31C54 36 53 43 51 48C46 42 43 36 44 32Z" fill="#B4E77D"/>
    <path d="M29 39C33 40 36 43 39 46M66 41C63 44 60 47 57 48" stroke="#D5F2A0" stroke-width="1.8" stroke-linecap="round" opacity="0.78"/>
  </svg>`,

  // 31-80%: cây non có thân phân nhánh và tán lá nhiều lớp
  growing: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="92" rx="31" ry="5" fill="#8D6B42" opacity="0.38"/>
    <path d="M46 91C48 77 47 65 50 54C52 45 56 37 60 30M49 67C42 57 35 51 27 47M50 61C58 56 66 50 73 43M52 49C48 39 46 31 47 22" stroke="#70472D" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M47 90C48 75 48 62 51 51C54 40 58 31 60 25" stroke="#A66D3E" stroke-width="2.2" stroke-linecap="round" opacity="0.78"/>
    <path d="M16 53C11 43 17 31 27 27C30 16 43 12 51 19C59 10 75 16 77 28C89 34 89 49 80 56C79 67 66 72 57 66C48 74 34 69 31 61C24 64 18 60 16 53Z" fill="#347D43"/>
    <path d="M19 47C16 38 22 31 31 30C33 21 43 18 50 24C56 16 69 20 71 30C81 33 84 44 77 51C70 59 61 58 55 53C49 62 37 62 32 54C26 58 21 54 19 47Z" fill="#58A950"/>
    <path d="M35 30C37 22 47 21 52 27C58 21 67 24 68 32C76 36 74 46 67 49C60 53 54 48 51 43C46 50 36 48 33 42C27 40 29 32 35 30Z" fill="#81C95C"/>
    <path d="M24 39C27 35 31 33 36 33M59 30C63 28 67 29 70 32M57 53C61 56 67 56 71 53" stroke="#B4E77A" stroke-width="2.4" stroke-linecap="round" opacity="0.72"/>
    <path d="M24 48C29 48 33 51 36 55M69 42C73 41 76 43 78 46" stroke="#2E6B3C" stroke-width="2" stroke-linecap="round" opacity="0.75"/>
  </svg>`,

  // 81-100%: cây trưởng thành với tán tròn rộng, nhiều lớp sáng tối
  full: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="92" rx="33" ry="5" fill="#765437" opacity="0.36"/>
    <path d="M44 91C48 77 46 66 50 54C53 43 59 34 64 24M49 68C40 57 32 50 22 43M51 63C62 56 72 47 79 38M53 49C48 38 46 29 47 18" stroke="#68432D" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M45 89C49 73 48 63 52 51C56 39 61 29 65 22" stroke="#A16A3F" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>
    <path d="M11 55C7 44 13 34 22 29C20 18 33 11 43 17C49 7 65 8 70 19C82 16 91 27 86 38C96 46 89 60 78 62C74 73 59 76 51 68C41 77 27 71 26 63C19 65 13 61 11 55Z" fill="#286A3B"/>
    <path d="M17 48C13 39 19 31 29 29C32 18 43 16 51 23C59 12 73 17 74 29C84 32 87 42 80 50C74 59 64 60 56 53C49 64 36 64 31 55C23 59 18 55 17 48Z" fill="#459448"/>
    <path d="M29 39C27 30 36 24 44 28C49 17 62 17 67 27C77 28 80 39 73 46C68 53 58 51 52 45C47 55 35 54 31 47C25 47 24 42 29 39Z" fill="#70B954"/>
    <path d="M39 28C43 21 51 22 55 28C61 21 69 24 71 31C78 34 76 42 70 45C64 48 58 44 54 40C49 47 41 45 38 40C32 38 34 31 39 28Z" fill="#91D267"/>
    <path d="M21 40C24 36 28 34 33 34M59 28C63 25 68 27 71 30M58 52C64 56 70 55 74 51M34 55C38 59 43 60 47 58" stroke="#B9E985" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>
    <path d="M25 49C30 48 34 51 37 55M69 41C73 40 77 42 79 45" stroke="#286A3B" stroke-width="2.2" stroke-linecap="round" opacity="0.8"/>
    <circle cx="36" cy="31" r="2.2" fill="#F2D77D"/><circle cx="76" cy="48" r="2" fill="#F2D77D"/><circle cx="53" cy="22" r="1.8" fill="#F2D77D"/>
  </svg>`,

  // Cây héo: thân khô và tán rũ, vẫn cùng silhouette với các giai đoạn khác
  dead: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="92" rx="31" ry="5" fill="#765C4B" opacity="0.34"/>
    <path d="M45 91C48 78 46 66 50 55C54 43 61 34 62 23M49 68C41 59 33 53 24 50M51 61C62 55 70 49 77 41M53 48C50 38 48 31 44 22" stroke="#665148" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M46 89C49 75 48 64 52 52C56 40 61 31 63 24" stroke="#9B7860" stroke-width="2" stroke-linecap="round" opacity="0.75"/>
    <path d="M22 48C17 42 19 35 25 33C26 26 34 24 39 29C44 25 50 29 49 35C48 43 39 47 31 49C28 54 23 53 22 48Z" fill="#827866"/>
    <path d="M49 38C45 32 47 25 54 23C57 16 66 17 68 24C76 23 80 30 76 36C72 42 62 43 54 41C52 44 49 42 49 38Z" fill="#93856A"/>
    <path d="M59 55C59 48 65 44 71 46C76 41 83 44 83 50C89 54 86 61 80 63C73 65 66 61 61 60C58 61 57 58 59 55Z" fill="#756B5D"/>
    <path d="M27 36C30 33 34 33 37 36M56 28C60 25 65 26 67 29M68 52C72 49 76 50 79 53" stroke="#B7A27D" stroke-width="2.2" stroke-linecap="round" opacity="0.7"/>
    <path d="M42 64L36 69M57 60L63 65" stroke="#665148" stroke-width="2.2" stroke-linecap="round"/>
  </svg>`,
};
