export function createWidgetRenderer(services) {
  const {
    volumeWidget,
    appSliderWidget,
    micWidget,
    mediaWidget,
    musicWaveWidget,
    shutdownWidget,
    pomodoroWidget,
    clockWidget,
    weatherWidget,
    bongoCatWidget,
    todoWidget,
    isVectorIcon,
    vectorMarkup,
    isDefaultVolIcon,
    VOL_GLYPH,
    clampInt,
    formatIconSource,
    parseClockCfg,
    parseWeatherCfg,
    parseBongoCfg,
    applyWidgetTier,
    applyKeyTitle,
    registerLiveWidget,
    unregisterLiveWidget,
  } = services;

  const widgetDefinitions = {
    volume_slider: {
      widget: volumeWidget,
      render(el, content) {
        const currentVolume = clampInt(parseInt(el.dataset.target, 10), 0, 100, 50);
        content.innerHTML = volumeWidget.markup(
          isVectorIcon(el.dataset.icon)
            ? vectorMarkup(el.dataset.icon)
            : isDefaultVolIcon(el.dataset.icon)
              ? VOL_GLYPH
              : el.dataset.icon,
          currentVolume
        );
        volumeWidget.setup(content, el);
      },
    },
    app_slider: {
      widget: appSliderWidget,
      render(el, content) {
        content.innerHTML = appSliderWidget.markup(
          formatIconSource(el.dataset.icon, el.dataset.icon2x)
        );
        appSliderWidget.setup(content, el);
        appSliderWidget.update(el);
        appSliderWidget.refresh().then(() => appSliderWidget.update(el));
      },
    },
    mic_widget: {
      widget: micWidget,
      render(el, content) {
        content.innerHTML = micWidget.markup();
        micWidget.setup(el);
      },
    },
    media_player: {
      widget: mediaWidget,
      render(_el, content) {
        content.innerHTML = mediaWidget.markup();
        mediaWidget.setup(content);
      },
    },
    music_wave: {
      widget: musicWaveWidget,
      render(el, content) {
        content.innerHTML = musicWaveWidget.markup();
        musicWaveWidget.setup(el);
      },
    },
    shutdown_widget: {
      widget: shutdownWidget,
      render(el, content) {
        content.innerHTML = shutdownWidget.markup();
        shutdownWidget.setup(el);
      },
    },
    pomodoro: {
      widget: pomodoroWidget,
      render(el, content) {
        pomodoroWidget.prepare(el);
        content.innerHTML = pomodoroWidget.markup();
        pomodoroWidget.setup(el);
        pomodoroWidget.render(el);
      },
    },
    mini_clock: {
      widget: clockWidget,
      render(el, content) {
        content.innerHTML = clockWidget.markup(parseClockCfg(el));
        clockWidget.setup(el);
        clockWidget.update(clockWidget.register(el), { applyWidgetTier });
      },
    },
    weather_widget: {
      widget: weatherWidget,
      render(el, content) {
        content.innerHTML = weatherWidget.markup(parseWeatherCfg(el).city);
        weatherWidget.setup(el);
        weatherWidget.update(weatherWidget.register(el));
      },
    },
    bongo_cat: {
      widget: bongoCatWidget,
      render(el, content) {
        content.innerHTML = bongoCatWidget.markup(parseBongoCfg(el));
        el.__bongoState = { events: [] };
        bongoCatWidget.setup(el);
      },
    },
    todo_list: {
      widget: todoWidget,
      render(el, content) {
        content.innerHTML = todoWidget.markup();
        todoWidget.setup(el);
        todoWidget.update(todoWidget.register(el), true);
      },
    },
  };

  function destroyWidgetContent(el) {
    const type = el.__renderedWidgetType;
    unregisterLiveWidget(el);
    if (type) widgetDefinitions[type]?.widget?.destroy?.(el);
    delete el.__renderedWidgetType;
  }

  function renderWidgetBody(el) {
    const content = el.querySelector('.grid-stack-item-content') || el;
    const type = el.dataset.type;
    const definition = widgetDefinitions[type];
    if (definition) {
      definition.render(el, content);
    } else {
      content.innerHTML = `
        <div class="deck-icon-core" data-fit="${el.dataset.fit === 'cover' ? 'cover' : 'contain'}">
          <span class="icon-chip">${formatIconSource(el.dataset.icon, el.dataset.icon2x)}</span>
        </div>`;
    }
  }

  function renderWidgetContent(el) {
    destroyWidgetContent(el);
    renderWidgetBody(el);
    el.__renderedWidgetType = el.dataset.type;
    applyKeyTitle(el);
    registerLiveWidget(el);
  }

  return { renderWidgetContent, renderWidgetBody, destroyWidgetContent };
}
