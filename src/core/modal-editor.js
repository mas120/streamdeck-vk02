export function createModalEditor(services) {
  const {
    grid,
    initIconUI,
    invokeCmd,
    formatIconSource,
    saveCurrentLayout,
    applyDisplayToEl,
    renderWidgetContent,
    unregisterLiveWidget,
    hydrateVectorIcons,
    parsePomoTarget,
    clampInt,
    clampFloat,
    normalizeClockFace,
    CLOCK_DEFAULT,
    parseClockCfg,
    clockZoneLabel,
    WEATHER_DEFAULT,
    parseWeatherCfg,
    normalizeWeatherSkin,
    parseBongoCfg,
    normalizeBongoSize,
    defaultIconForType,
    appSliderWidget,
    createWidgetEl,
    removeTile,
  } = services;
  let currentEditingEl = null; // phím đang sửa (null = tạo phím mới)
  let pendingPos = null; // ô (x,y) đã chạm khi tạo phím mới
  /* 8. Modal chỉnh sửa phím */
  const modal = document.getElementById('editModal');
  const inpIcon = document.getElementById('inpIcon');
  const selType = document.getElementById('selType');
  const inpTarget = document.getElementById('inpTarget');
  const grpTarget = document.getElementById('grpTarget');
  const grpApp = document.getElementById('grpApp');
  const selApp = document.getElementById('selApp');
  const btnSave = document.getElementById('btnSave');
  const btnDelete = document.getElementById('btnDelete');
  const btnCancel = document.getElementById('btnCancel');
  const modalHeading = document.getElementById('modalHeading');
  const grpTileSize = document.getElementById('grpTileSize');
  const selTileSize = document.getElementById('selTileSize');

  const btnPickFile = document.getElementById('btnPickFile');
  const filePicker = document.getElementById('filePicker');

  const grpPomodoro = document.getElementById('grpPomodoro');
  const inpPomodoroWork = document.getElementById('inpPomodoroWork');
  const inpPomodoroBreak = document.getElementById('inpPomodoroBreak');

  const grpBongo = document.getElementById('grpBongo');
  const selBongoSize = document.getElementById('selBongoSize');
  const chkBongoKps = document.getElementById('chkBongoKps');

  /* Widget Đồng hồ: kiểu mặt + múi giờ + nhãn */
  const grpClock = document.getElementById('grpClock');
  const selClockFace = document.getElementById('selClockFace');
  const inpClockTz = document.getElementById('inpClockTz');
  const inpClockLabel = document.getElementById('inpClockLabel');

  /* Widget Thời tiết: toạ độ + tên thành phố + skin + API key (dự phòng) */
  const grpWeather = document.getElementById('grpWeather');
  const inpWeatherLat = document.getElementById('inpWeatherLat');
  const inpWeatherLon = document.getElementById('inpWeatherLon');
  const inpWeatherCity = document.getElementById('inpWeatherCity');
  const selWeatherSkin = document.getElementById('selWeatherSkin');
  const inpWeatherKey = document.getElementById('inpWeatherKey');
  const btnWeatherLocate = document.getElementById('btnWeatherLocate');

  /* Hiển thị phím: khớp ảnh + nhãn chồng lên icon */
  const grpFit = document.getElementById('grpFit');
  const selIconFit = document.getElementById('selIconFit');
  const inpTitle = document.getElementById('inpTitle');
  const selTitlePos = document.getElementById('selTitlePos');
  const inpTitleSize = document.getElementById('inpTitleSize');
  const chkTitleShadow = document.getElementById('chkTitleShadow');

  function readDisplayFromModal() {
    return {
      fit: selIconFit.value,
      title: inpTitle.value,
      titlePos: selTitlePos.value,
      titleSize: inpTitleSize.value,
      titleShadow: chkTitleShadow.checked,
    };
  }

  btnPickFile.addEventListener('click', () => filePicker.click());

  /* Icon: picker Lucide/Simple Icons/emoji + tải ảnh chuẩn hoá 1:1 144/288px +
   tự lấy icon app / favicon (xem src/icons.js). */
  const iconUI = initIconUI({
    input: inpIcon,
    invoke: invokeCmd,
    renderIcon: (icon, icon2x) => formatIconSource(icon || '⏹️', icon2x),
    getContext: () => ({ type: selType.value, target: inpTarget.value.trim() }),
  });

  filePicker.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    await iconUI.importFile(file);
  });

  function syncModalTypeFields() {
    const type = selType.value;
    grpTarget.style.display = type === 'open_url' || type === 'launch_app' ? 'flex' : 'none';
    grpApp.style.display = type === 'app_slider' ? 'flex' : 'none';
    grpPomodoro.style.display = type === 'pomodoro' ? 'flex' : 'none';
    grpClock.style.display = type === 'mini_clock' ? 'flex' : 'none';
    grpWeather.style.display = type === 'weather_widget' ? 'flex' : 'none';
    grpBongo.style.display = type === 'bongo_cat' ? 'flex' : 'none';
    grpFit.style.display = type === 'open_url' || type === 'launch_app' ? 'flex' : 'none';
    // Cỡ ô chỉ chọn khi tạo mới; clock/weather/bongo có cỡ riêng theo cấu hình.
    const fixedSize =
      type === 'mini_clock' ||
      type === 'weather_widget' ||
      type === 'bongo_cat' ||
      type === 'mic_widget';
    grpTileSize.style.display = !currentEditingEl && !fixedSize ? 'flex' : 'none';
    Array.from(selTileSize.options).forEach((option) => {
      const [, height] = option.value.split('x').map(Number);
      option.hidden = type === 'music_wave' && Number.isFinite(height) && height !== 1;
    });
    iconUI.syncType(type);
    if (type === 'app_slider') populateAppSelect();
  }

  /* Nạp danh sách app đang phát âm thanh vào dropdown chọn app */
  async function populateAppSelect() {
    await appSliderWidget.refresh();
    const prev = selApp.value;
    selApp.innerHTML = '';
    const audioSessionCache = appSliderWidget.getSessions();
    if (!audioSessionCache.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '(Không có app nào đang phát âm thanh)';
      selApp.appendChild(opt);
      return;
    }
    audioSessionCache.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.name;
      const label = s.label || s.name;
      opt.textContent = `${label} — ${Math.round((s.volume || 0) * 100)}%`;
      // Tooltip hiển thị tên tiến trình thật (vd "brave.exe") để phân biệt khi
      // nhiều tab cùng nhãn.
      opt.title = s.name;
      selApp.appendChild(opt);
    });
    if (prev && audioSessionCache.some((s) => s.name === prev)) selApp.value = prev;
  }

  selType.addEventListener('change', syncModalTypeFields);

  function openEditModal(el = null, pos = null) {
    currentEditingEl = el;
    pendingPos = el ? null : pos;
    filePicker.value = '';
    if (el) {
      modalHeading.innerText = 'Cài Đặt Phím Bấm';
      iconUI.setValue(el.dataset.icon || '', el.dataset.icon2x || '');
      selType.value = el.dataset.type || 'open_url';
      inpTarget.value = el.dataset.target || '';
      selIconFit.value = el.dataset.fit === 'cover' ? 'cover' : 'contain';
      inpTitle.value = el.dataset.title || '';
      selTitlePos.value = el.dataset.titlePos || 'bottom';
      inpTitleSize.value = el.dataset.titleSize || '14';
      chkTitleShadow.checked = el.dataset.titleShadow !== '0';
      btnDelete.style.display = 'block';
      if ((el.dataset.type || '') === 'pomodoro') {
        const [wm, bm] = parsePomoTarget(
          el.dataset.target || `${el.dataset.work},${el.dataset.break}`
        );
        inpPomodoroWork.value = String(wm);
        inpPomodoroBreak.value = String(bm);
      }
      if ((el.dataset.type || '') === 'mini_clock') {
        const clockCfg = parseClockCfg(el);
        selClockFace.value = normalizeClockFace(clockCfg.face);
        inpClockTz.value = String(clockCfg.tz);
        inpClockLabel.value = clockCfg.label || '';
      }
      if ((el.dataset.type || '') === 'weather_widget') {
        const wxCfg = parseWeatherCfg(el);
        inpWeatherLat.value = String(wxCfg.lat);
        inpWeatherLon.value = String(wxCfg.lon);
        inpWeatherCity.value = wxCfg.city;
        if (selWeatherSkin) selWeatherSkin.value = normalizeWeatherSkin(wxCfg.skin);
        if (inpWeatherKey) inpWeatherKey.value = wxCfg.apiKey;
      }
      if ((el.dataset.type || '') === 'bongo_cat') {
        const bongoCfg = parseBongoCfg(el);
        if (selBongoSize) selBongoSize.value = bongoCfg.size;
        if (chkBongoKps) chkBongoKps.checked = bongoCfg.showKps;
      }
    } else {
      modalHeading.innerText = 'Tạo Phím Mới';
      iconUI.setValue('⭐', '');
      selType.value = 'open_url';
      selTileSize.value = 'auto';
      inpTarget.value = '';
      selIconFit.value = 'contain';
      inpTitle.value = '';
      selTitlePos.value = 'bottom';
      inpTitleSize.value = '14';
      chkTitleShadow.checked = true;
      inpPomodoroWork.value = '25';
      inpPomodoroBreak.value = '5';
      selClockFace.value = CLOCK_DEFAULT.face;
      inpClockTz.value = String(CLOCK_DEFAULT.tz);
      inpClockLabel.value = CLOCK_DEFAULT.label;
      inpWeatherLat.value = String(WEATHER_DEFAULT.lat);
      inpWeatherLon.value = String(WEATHER_DEFAULT.lon);
      inpWeatherCity.value = WEATHER_DEFAULT.city;
      if (selWeatherSkin) selWeatherSkin.value = WEATHER_DEFAULT.skin;
      if (inpWeatherKey) inpWeatherKey.value = '';
      if (selBongoSize) selBongoSize.value = '2x1';
      if (chkBongoKps) chkBongoKps.checked = true;
      btnDelete.style.display = 'none';
    }
    syncModalTypeFields();
    if (selType.value === 'app_slider') {
      populateAppSelect().then(() => {
        if (el && el.dataset.target) selApp.value = el.dataset.target;
      });
    }
    modal.classList.add('active');
  }

  btnCancel.addEventListener('click', () => {
    modal.classList.remove('active');
    currentEditingEl = null;
    pendingPos = null;
  });

  /* Tự định vị theo IP: điền lat/lon/thành phố, người dùng vẫn bấm Lưu để áp dụng */
  if (btnWeatherLocate) {
    btnWeatherLocate.addEventListener('click', async () => {
      const idleLabel = btnWeatherLocate.textContent;
      btnWeatherLocate.disabled = true;
      btnWeatherLocate.textContent = 'Đang định vị...';
      try {
        const loc = await invokeCmd('locate_by_ip');
        if (!loc) throw new Error('Không có backend định vị');
        inpWeatherLat.value = String(loc.lat);
        inpWeatherLon.value = String(loc.lon);
        inpWeatherCity.value = loc.city;
        btnWeatherLocate.textContent = 'Đã điền vị trí';
      } catch (err) {
        console.warn('Định vị theo IP thất bại:', err);
        btnWeatherLocate.textContent = 'Không định vị được';
      } finally {
        btnWeatherLocate.disabled = false;
        setTimeout(() => {
          btnWeatherLocate.textContent = idleLabel;
        }, 2000);
      }
    });
  }

  btnSave.addEventListener('click', async () => {
    // Phím app/web chưa chọn icon (còn mặc định) -> tự lấy icon thật / favicon.
    btnSave.disabled = true;
    try {
      await iconUI.autoFillIfDefault();
    } finally {
      btnSave.disabled = false;
    }
    const type = selType.value;
    const isPomo = type === 'pomodoro';
    const isClock = type === 'mini_clock';
    const isWeather = type === 'weather_widget';
    const isMic = type === 'mic_widget';
    const pomoWork = clampInt(inpPomodoroWork ? inpPomodoroWork.value : 25, 1, 180, 25);
    const pomoBreak = clampInt(inpPomodoroBreak ? inpPomodoroBreak.value : 5, 1, 120, 5);

    // Cấu hình widget "sống" lấy từ modal (đã chuẩn hoá biên).
    // 3 kiểu mặt dùng CHUNG normalizeClockFace (giống hệt lúc đọc dataset).
    const clockFace = normalizeClockFace(selClockFace.value);
    // Cỡ tối thiểu theo kiểu mặt: Digital 1x1, Thẻ lật 2x1, Analog 2x2.
    const minW = clockFace === 'digital' ? 1 : 2;
    const minH = clockFace === 'analog' ? 2 : 1;
    const clockTz = clampFloat(
      inpClockTz ? inpClockTz.value : CLOCK_DEFAULT.tz,
      -12,
      14,
      CLOCK_DEFAULT.tz
    );
    const clockLabel =
      ((inpClockLabel ? inpClockLabel.value : '') || '').trim() || clockZoneLabel(clockTz);
    const weatherLat = clampFloat(
      inpWeatherLat ? inpWeatherLat.value : WEATHER_DEFAULT.lat,
      -90,
      90,
      WEATHER_DEFAULT.lat
    );
    const weatherLon = clampFloat(
      inpWeatherLon ? inpWeatherLon.value : WEATHER_DEFAULT.lon,
      -180,
      180,
      WEATHER_DEFAULT.lon
    );
    const weatherCity =
      ((inpWeatherCity ? inpWeatherCity.value : '') || '').trim() || WEATHER_DEFAULT.city;
    // Skin: "Màu dịu" (gradient) | "Phẳng" (nền #111317) — chuẩn hoá chung 1 hàm.
    const weatherSkin = normalizeWeatherSkin(
      selWeatherSkin ? selWeatherSkin.value : WEATHER_DEFAULT.skin
    );
    // API key: chỗ dành sẵn cho provider cần khoá (Open-Meteo miễn phí, không cần).
    const weatherKey = ((inpWeatherKey ? inpWeatherKey.value : '') || '').trim();
    const bongoSize = normalizeBongoSize(selBongoSize ? selBongoSize.value : '2x1');
    const bongoShowKps = !!(chkBongoKps ? chkBongoKps.checked : true);
    const display = readDisplayFromModal(); // khớp ảnh + nhãn chồng lên icon

    if (currentEditingEl) {
      currentEditingEl.dataset.icon = inpIcon.value.trim() || defaultIconForType(type);
      if (iconUI.getIcon2x()) currentEditingEl.dataset.icon2x = iconUI.getIcon2x();
      else delete currentEditingEl.dataset.icon2x;
      currentEditingEl.dataset.type = type;
      applyDisplayToEl(currentEditingEl, display);
      if (isPomo) {
        currentEditingEl.dataset.work = String(pomoWork);
        currentEditingEl.dataset.break = String(pomoBreak);
        currentEditingEl.dataset.target = `${pomoWork},${pomoBreak}`;
        // Đổi cấu hình -> khởi tạo lại timer theo thời lượng mới (về Work, dừng).
        currentEditingEl.__pomoInit = { workMin: pomoWork, breakMin: pomoBreak, restore: null };
      } else if (isClock) {
        // Đồng hồ: đổi kiểu mặt + múi giờ + nhãn (target giữ dạng "face,tz").
        currentEditingEl.dataset.target = `${clockFace},${clockTz}`;
        currentEditingEl.dataset.cfg = JSON.stringify({
          face: clockFace,
          tz: clockTz,
          label: clockLabel,
        });
        // Tự nới phím cho đủ chỗ: Thẻ lật cần >= 2x1, Analog cần >= 2x2.
        const node = currentEditingEl.gridstackNode;
        if (node && (node.w < minW || node.h < minH)) {
          grid.update(currentEditingEl, { w: Math.max(minW, node.w), h: Math.max(minH, node.h) });
        }
      } else if (isWeather) {
        // Thời tiết: đổi toạ độ + tên thành phố + skin (+ API key dự phòng).
        currentEditingEl.dataset.target = `${weatherLat},${weatherLon}`;
        currentEditingEl.dataset.cfg = JSON.stringify({
          lat: weatherLat,
          lon: weatherLon,
          city: weatherCity,
          skin: weatherSkin,
          apiKey: weatherKey,
        });
      } else if (type === 'bongo_cat') {
        currentEditingEl.dataset.target = bongoSize;
        currentEditingEl.dataset.showKps = bongoShowKps ? '1' : '0';
        currentEditingEl.dataset.cfg = JSON.stringify({ size: bongoSize, showKps: bongoShowKps });
        const node = currentEditingEl.gridstackNode;
        if (node && node.w < 2) grid.update(currentEditingEl, { w: 2 });
        if (node && bongoSize === '2x2' && node.h < 2) grid.update(currentEditingEl, { h: 2 });
        if (node && bongoSize === '2x1' && node.h > 1) grid.update(currentEditingEl, { h: 1 });
      } else if (type === 'app_slider') {
        currentEditingEl.dataset.target = selApp.value || '';
        currentEditingEl.dataset.pid = '';
      } else if (isMic) {
        currentEditingEl.dataset.target = 'mic';
      } else if (type === 'music_wave') {
        currentEditingEl.dataset.target = '';
        if (currentEditingEl.gridstackNode?.h !== 1) grid.update(currentEditingEl, { h: 1 });
      } else if (type === 'shutdown_widget') {
        currentEditingEl.dataset.target = '';
      } else if (type !== 'volume_slider' && type !== 'todo_list' && type !== 'media_player') {
        currentEditingEl.dataset.target = inpTarget.value.trim();
      }
      renderWidgetContent(currentEditingEl);
      appSliderWidget.refresh().then(() => appSliderWidget.sync());
    } else {
      const placement = {};
      if (pendingPos) {
        Object.assign(placement, pendingPos, { clampToFree: true });
        if (grpTileSize.style.display !== 'none' && selTileSize.value !== 'auto') {
          [placement.w, placement.h] = selTileSize.value.split('x').map(Number);
        }
      }
      createWidgetEl({
        ...placement,
        icon: inpIcon.value.trim() || defaultIconForType(type, '⭐'),
        type,
        icon2x: iconUI.getIcon2x() || undefined,
        ...display,
        target:
          type === 'bongo_cat'
            ? bongoSize
            : isPomo
              ? `${pomoWork},${pomoBreak}`
              : isClock
                ? `${clockFace},${clockTz}`
                : isWeather
                  ? `${weatherLat},${weatherLon}`
                  : type === 'volume_slider'
                    ? '50'
                    : type === 'app_slider'
                      ? selApp.value || ''
                      : type === 'todo_list' ||
                          type === 'media_player' ||
                          type === 'music_wave' ||
                          type === 'shutdown_widget'
                        ? ''
                        : inpTarget.value.trim(),
        cfg:
          type === 'bongo_cat'
            ? { size: bongoSize, showKps: bongoShowKps }
            : isClock
              ? { face: clockFace, tz: clockTz, label: clockLabel }
              : isWeather
                ? {
                    lat: weatherLat,
                    lon: weatherLon,
                    city: weatherCity,
                    skin: weatherSkin,
                    apiKey: weatherKey,
                  }
                : undefined,
      });
    }

    saveCurrentLayout();
    hydrateVectorIcons(); // bộ icon nạp lazy: điền SVG cho span còn rỗng
    modal.classList.remove('active');
    currentEditingEl = null;
    pendingPos = null;
  });

  btnDelete.addEventListener('click', () => {
    if (currentEditingEl) removeTile(currentEditingEl);
    modal.classList.remove('active');
    currentEditingEl = null;
  });

  return {
    openEditModal,
    closeModal() {
      modal.classList.remove('active');
      currentEditingEl = null;
    },
    isOpen() {
      return modal.classList.contains('active');
    },
  };
}
