// Debug script - paste vào Console khi app đang chạy

console.clear();
console.log('=== STREAM DECK DEBUG ===');

// 1. Check dependencies
console.log('1. GridStack:', typeof GridStack);
console.log('2. grid:', typeof grid, grid);

// 3. Check widgets
if (typeof grid !== 'undefined' && grid) {
  console.log('3. Grid nodes:', grid.engine.nodes);
  console.log('4. Grid nodes count:', grid.engine.nodes.length);
}

// 5. Check DOM
const items = document.querySelectorAll('.grid-stack-item');
console.log('5. DOM .grid-stack-item count:', items.length);
if (items.length > 0) {
  console.log('6. First item:', items[0]);
} else {
  console.log('6. No items in DOM!');
}

// 7. Check layout load
console.log('7. localStorage:', localStorage.getItem('STREAMDECK_VK02_LAYOUT'));

// 8. Force add widget
if (typeof grid !== 'undefined' && grid && typeof createWidgetEl === 'function') {
  console.log('8. Trying to add test widget...');
  try {
    createWidgetEl({ x: 0, y: 0, w: 1, h: 1, icon: "🔴", type: "open_url", target: "test" });
    console.log('✓ Widget added successfully');
  } catch (err) {
    console.error('✗ Failed to add widget:', err);
  }
}

// 9. Check grid container
const gridContainer = document.querySelector('.grid-stack');
console.log('9. Grid container:', gridContainer);
console.log('10. Grid HTML:', gridContainer ? gridContainer.innerHTML.substring(0, 200) : 'NO CONTAINER');

console.log('=== END DEBUG ===');
