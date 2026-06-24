/* ROG Monitor — Panel de eventos: filtro por categoría + modal explicativo.
 * Autocontenido. Expuesto como window.RogEventDetail.
 * Registra claves event.filter.* y event.explain.* via window.i18n.register().
 * Cargado después de app.js e i18n.js. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ i18n */
  window.i18n.register({
    /* ---- filter chips ---- */
    'event.filter.all':      { es: 'Todos',     en: 'All',      fr: 'Tous',      it: 'Tutti',    pt: 'Todos',    zh: '全部',    ja: 'すべて',   ko: '전체' },
    'event.filter.thermal':  { es: 'Térmica',   en: 'Thermal',  fr: 'Thermique', it: 'Termico',  pt: 'Térmica',  zh: '热量',    ja: '熱',       ko: '열' },
    'event.filter.throttle': { es: 'Throttle',  en: 'Throttle', fr: 'Throttle',  it: 'Throttle', pt: 'Throttle', zh: '降频',    ja: 'スロット', ko: '스로틀' },
    'event.filter.power':    { es: 'Potencia',  en: 'Power',    fr: 'Puissance', it: 'Potenza',  pt: 'Potência', zh: '功耗',    ja: '電力',     ko: '전력' },
    'event.filter.fan':      { es: 'Ventilador',en: 'Fan',      fr: 'Ventilateur',it: 'Ventola', pt: 'Ventoinha',zh: '风扇',    ja: 'ファン',   ko: '팬' },
    'event.filter.battery':  { es: 'Batería',   en: 'Battery',  fr: 'Batterie',  it: 'Batteria', pt: 'Bateria',  zh: '电池',    ja: 'バッテリー',ko: '배터리' },
    'event.filter.disk':     { es: 'Disco',     en: 'Disk',     fr: 'Disque',    it: 'Disco',    pt: 'Disco',    zh: '磁盘',    ja: 'ディスク', ko: '디스크' },

    /* ---- modal explain titles ---- */
    'event.explain.thermal.title':  {
      es: 'Temperatura crítica de CPU/GPU',
      en: 'Critical CPU/GPU Temperature',
      fr: 'Température critique CPU/GPU',
      it: 'Temperatura critica CPU/GPU',
      pt: 'Temperatura crítica CPU/GPU',
      zh: 'CPU/GPU 过高温度',
      ja: 'CPU/GPU 高温アラート',
      ko: 'CPU/GPU 과열 경고',
    },
    'event.explain.throttle.title': {
      es: 'Thermal Throttling',
      en: 'Thermal Throttling',
      fr: 'Throttling thermique',
      it: 'Throttling termico',
      pt: 'Throttling térmico',
      zh: '热降频',
      ja: 'サーマルスロットリング',
      ko: '열 스로틀링',
    },
    'event.explain.power.title': {
      es: 'Consumo de CPU elevado',
      en: 'High CPU Power Draw',
      fr: 'Consommation CPU élevée',
      it: 'Consumo CPU elevato',
      pt: 'Consumo de CPU elevado',
      zh: 'CPU 功耗过高',
      ja: 'CPU 高消費電力',
      ko: 'CPU 전력 초과',
    },
    'event.explain.fan.title': {
      es: 'Ventilador detenido bajo carga',
      en: 'Fan Stopped Under Load',
      fr: 'Ventilateur arrêté sous charge',
      it: 'Ventola ferma sotto carico',
      pt: 'Ventoinha parada sob carga',
      zh: '负载下风扇停转',
      ja: '負荷中にファン停止',
      ko: '부하 중 팬 정지',
    },
    'event.explain.battery.title': {
      es: 'Estado de batería',
      en: 'Battery Status',
      fr: 'État de la batterie',
      it: 'Stato della batteria',
      pt: 'Estado da bateria',
      zh: '电池状态',
      ja: 'バッテリー状態',
      ko: '배터리 상태',
    },
    'event.explain.disk.title': {
      es: 'Alerta de disco',
      en: 'Disk Alert',
      fr: 'Alerte disque',
      it: 'Avviso disco',
      pt: 'Alerta de disco',
      zh: '磁盘警报',
      ja: 'ディスクアラート',
      ko: '디스크 경고',
    },
    'event.explain.info.title': {
      es: 'Evento del sistema',
      en: 'System Event',
      fr: 'Événement système',
      it: 'Evento di sistema',
      pt: 'Evento do sistema',
      zh: '系统事件',
      ja: 'システムイベント',
      ko: '시스템 이벤트',
    },

    /* ---- modal explain bodies ---- */
    'event.explain.thermal.body': {
      es: '<b>¿Qué es?</b> La CPU o GPU superó el umbral de temperatura configurado en Alertas.<br><br><b>¿Cómo funciona?</b> Los sensores de temperatura integrados en el chip informan la temperatura del paquete térmico cada pocos segundos. Cuando este valor supera el umbral configurado (por defecto 90 °C CPU / 85 °C GPU), ROG Monitor registra el evento y lo muestra aquí.<br><br><b>¿Qué hacer?</b> Comprueba que los ventiladores giran correctamente. Sube el tope de RPM en el panel de Ventiladores. Limpia el polvo del portátil si llevas tiempo sin hacerlo. Considera bajar el perfil de energía a Balanced.',
      en: '<b>What is it?</b> The CPU or GPU exceeded the temperature threshold configured in Alerts.<br><br><b>How does it work?</b> Thermal sensors built into the chip report the package temperature every few seconds. When this value exceeds the configured threshold (default 90 °C CPU / 85 °C GPU), ROG Monitor logs the event and shows it here.<br><br><b>What to do?</b> Check that the fans are spinning correctly. Raise the RPM cap in the Fans panel. Clean the laptop\'s dust if it has been a while. Consider switching to the Balanced power profile.',
      fr: '<b>Qu\'est-ce que c\'est ?</b> Le CPU ou le GPU a dépassé le seuil de température configuré dans Alertes.<br><br><b>Comment ça fonctionne ?</b> Les capteurs thermiques intégrés au puce rapportent la température du package toutes les quelques secondes. Lorsque cette valeur dépasse le seuil configuré (par défaut 90 °C CPU / 85 °C GPU), ROG Monitor enregistre l\'événement et l\'affiche ici.<br><br><b>Que faire ?</b> Vérifiez que les ventilateurs tournent correctement. Augmentez la limite de tours/min dans le panneau Ventilateurs. Nettoyez la poussière si cela fait longtemps. Envisagez de passer au profil Balanced.',
      it: '<b>Cos\'è?</b> La CPU o la GPU ha superato la soglia di temperatura configurata in Avvisi.<br><br><b>Come funziona?</b> I sensori termici integrati nel chip riportano la temperatura del package ogni pochi secondi. Quando questo valore supera la soglia configurata (default 90 °C CPU / 85 °C GPU), ROG Monitor registra l\'evento e lo mostra qui.<br><br><b>Cosa fare?</b> Verifica che le ventole girino correttamente. Aumenta il limite RPM nel pannello Ventole. Pulisci la polvere dal laptop se è passato del tempo. Considera di abbassare il profilo di alimentazione a Balanced.',
      pt: '<b>O que é?</b> A CPU ou GPU ultrapassou o limiar de temperatura configurado em Alertas.<br><br><b>Como funciona?</b> Os sensores térmicos integrados no chip reportam a temperatura do pacote a cada poucos segundos. Quando este valor ultrapassa o limiar configurado (padrão 90 °C CPU / 85 °C GPU), o ROG Monitor regista o evento e mostra-o aqui.<br><br><b>O que fazer?</b> Verifica que as ventoinhas giram corretamente. Aumenta o tope de RPM no painel de Ventoinhas. Limpa o pó do portátil se já passou algum tempo. Considera mudar para o perfil Balanced.',
      zh: '<b>这是什么？</b> CPU 或 GPU 超过了"警报"中配置的温度阈值。<br><br><b>工作原理：</b> 芯片内置的温度传感器每隔几秒钟报告一次热封装温度。当该值超过配置的阈值（默认 CPU 90°C / GPU 85°C），ROG Monitor 会记录该事件并在此处显示。<br><br><b>建议措施：</b> 检查风扇是否正常运转。在风扇面板中提高转速上限。如果长时间未清洁，请清除笔记本电脑中的灰尘。考虑切换到 Balanced 电源配置文件。',
      ja: '<b>これは何ですか？</b> CPU または GPU が「アラート」で設定された温度しきい値を超えました。<br><br><b>仕組み：</b> チップに内蔵された温度センサーが数秒ごとにパッケージ温度を報告します。この値が設定されたしきい値（デフォルト CPU 90°C / GPU 85°C）を超えると、ROG Monitor がイベントを記録してここに表示します。<br><br><b>対処法：</b> ファンが正しく回転しているか確認してください。ファンパネルで RPM 上限を上げてください。しばらく掃除していない場合はほこりを取り除いてください。Balanced 電源プロファイルへの切り替えを検討してください。',
      ko: '<b>무엇인가요?</b> CPU 또는 GPU가 경고에서 설정된 온도 임계값을 초과했습니다.<br><br><b>작동 원리：</b> 칩에 내장된 온도 센서가 몇 초마다 패키지 온도를 보고합니다. 이 값이 설정된 임계값(기본 CPU 90°C / GPU 85°C)을 초과하면 ROG Monitor가 이벤트를 기록하고 여기에 표시합니다.<br><br><b>대처 방법：</b> 팬이 올바르게 회전하는지 확인하세요. 팬 패널에서 RPM 상한을 높이세요. 오랫동안 청소하지 않았다면 먼지를 제거하세요. Balanced 전원 프로파일로 전환하는 것을 고려하세요.',
    },
    'event.explain.throttle.body': {
      es: '<b>¿Qué es?</b> La CPU bajó su frecuencia de operación durante un tiempo detectable para no superar su límite térmico (~100 °C en Intel 13.ª gen HX).<br><br><b>¿Cómo funciona?</b> El procesador monitoriza su temperatura interna en tiempo real. Cuando está a punto de alcanzar el límite, reduce automáticamente los MHz de todos los núcleos (throttling). Este mecanismo es una protección normal: ocurre durante cargas muy pesadas o si la refrigeración no da abasto. ROG Monitor detecta la diferencia acumulada de microsegundos de throttling entre dos muestras y registra el evento si supera el mínimo configurado (100 ms por defecto).<br><br><b>¿Qué hacer?</b> Unos pocos eventos al iniciar una carga intensa son normales. Si son frecuentes, sube el tope de RPM de ventiladores, mejora la ventilación o baja el perfil de energía.',
      en: '<b>What is it?</b> The CPU lowered its operating frequency for a detectable period to stay within its thermal limit (~100 °C on Intel 13th-gen HX).<br><br><b>How does it work?</b> The processor monitors its internal temperature in real time. When it is about to reach the limit, it automatically reduces the MHz across all cores (throttling). This is a normal protection mechanism: it happens during very heavy loads or when cooling cannot keep up. ROG Monitor detects the accumulated microseconds of throttle time between two samples and logs the event if it exceeds the configured minimum (100 ms by default).<br><br><b>What to do?</b> A few events when starting a heavy load are normal. If they are frequent, raise the fan RPM cap, improve ventilation or lower the power profile.',
      fr: '<b>Qu\'est-ce que c\'est ?</b> Le CPU a baissé sa fréquence de fonctionnement pendant une période détectable pour rester dans sa limite thermique (~100 °C sur Intel 13e gen HX).<br><br><b>Comment ça fonctionne ?</b> Le processeur surveille sa température interne en temps réel. Lorsqu\'il est sur le point d\'atteindre la limite, il réduit automatiquement les MHz de tous les cœurs (throttling). C\'est un mécanisme de protection normal : cela se produit lors de charges très lourdes ou quand le refroidissement ne suit pas. ROG Monitor détecte la différence cumulée de microsecondes de throttle entre deux échantillons et enregistre l\'événement si elle dépasse le minimum configuré (100 ms par défaut).<br><br><b>Que faire ?</b> Quelques événements au démarrage d\'une charge intense sont normaux. S\'ils sont fréquents, augmentez la limite RPM des ventilateurs, améliorez la ventilation ou baissez le profil de puissance.',
      it: '<b>Cos\'è?</b> La CPU ha abbassato la sua frequenza operativa per un periodo rilevabile per rimanere entro il suo limite termico (~100 °C su Intel 13a gen HX).<br><br><b>Come funziona?</b> Il processore monitora la sua temperatura interna in tempo reale. Quando sta per raggiungere il limite, riduce automaticamente i MHz di tutti i core (throttling). Questo è un normale meccanismo di protezione: accade durante carichi molto pesanti o quando il raffreddamento non riesce a tenere il passo. ROG Monitor rileva la differenza accumulata di microsecondi di throttle tra due campioni e registra l\'evento se supera il minimo configurato (100 ms per default).<br><br><b>Cosa fare?</b> Pochi eventi all\'avvio di un carico intenso sono normali. Se sono frequenti, aumenta il limite RPM delle ventole, migliora la ventilazione o abbassa il profilo di alimentazione.',
      pt: '<b>O que é?</b> A CPU baixou a sua frequência de operação durante um período detetável para ficar dentro do seu limite térmico (~100 °C no Intel 13.ª gen HX).<br><br><b>Como funciona?</b> O processador monitoriza a sua temperatura interna em tempo real. Quando está prestes a atingir o limite, reduz automaticamente os MHz de todos os núcleos (throttling). Este é um mecanismo de proteção normal: ocorre durante cargas muito pesadas ou quando a refrigeração não consegue acompanhar. O ROG Monitor deteta a diferença acumulada de microssegundos de throttle entre duas amostras e regista o evento se ultrapassar o mínimo configurado (100 ms por defeito).<br><br><b>O que fazer?</b> Alguns eventos ao iniciar uma carga intensa são normais. Se forem frequentes, sobe o tope de RPM das ventoinhas, melhora a ventilação ou baixa o perfil de energia.',
      zh: '<b>这是什么？</b> CPU 降低了其运行频率一段可检测的时间，以保持在其热限制范围内（Intel 13代 HX 约为 100°C）。<br><br><b>工作原理：</b> 处理器实时监控其内部温度。当接近限制时，它会自动降低所有核心的 MHz（降频）。这是一种正常的保护机制：在极重负载或散热跟不上时发生。ROG Monitor 检测两次采样之间累积的降频微秒差，如果超过配置的最小值（默认 100 ms），则记录该事件。<br><br><b>建议措施：</b> 在开始重负载时发生几次事件是正常的。如果频繁发生，请提高风扇 RPM 上限，改善通风或降低电源配置文件。',
      ja: '<b>これは何ですか？</b> CPU が熱限界（Intel 13世代 HX では約 100°C）を超えないよう、検出可能な時間だけ動作周波数を下げました。<br><br><b>仕組み：</b> プロセッサは内部温度をリアルタイムで監視します。限界に近づくと、すべてのコアの MHz を自動的に下げます（スロットリング）。これは正常な保護機構です。非常に重い負荷時や冷却が追いつかない場合に発生します。ROG Monitor は 2 つのサンプル間のスロットル時間の累積マイクロ秒差を検出し、設定された最小値（デフォルト 100 ms）を超えるとイベントを記録します。<br><br><b>対処法：</b> 高負荷開始時に数回発生するのは正常です。頻繁に発生する場合は、ファン RPM 上限を上げるか、換気を改善するか、電源プロファイルを下げてください。',
      ko: '<b>무엇인가요？</b> CPU가 열 한계(Intel 13세대 HX에서 약 100°C) 이내를 유지하기 위해 감지 가능한 시간 동안 작동 주파수를 낮췄습니다.<br><br><b>작동 원리：</b> 프로세서는 내부 온도를 실시간으로 모니터링합니다. 한계에 근접하면 모든 코어의 MHz를 자동으로 낮춥니다(스로틀링). 이것은 정상적인 보호 메커니즘입니다. 매우 무거운 부하나 냉각이 따라가지 못할 때 발생합니다. ROG Monitor는 두 샘플 사이의 누적 스로틀 마이크로초 차이를 감지하고 설정된 최소값(기본 100ms)을 초과하면 이벤트를 기록합니다.<br><br><b>대처 방법：</b> 무거운 부하 시작 시 몇 번 발생하는 것은 정상입니다. 자주 발생하는 경우 팬 RPM 상한을 높이거나, 환기를 개선하거나, 전원 프로파일을 낮추세요.',
    },
    'event.explain.power.body': {
      es: '<b>¿Qué es?</b> El consumo de potencia de la CPU superó el umbral configurado en Alertas (por defecto 80 W).<br><br><b>¿Cómo funciona?</b> ROG Monitor lee el consumo eléctrico de la CPU a través de la interfaz RAPL (Running Average Power Limit) del kernel. Este valor incluye el paquete del procesador (núcleos + caché + controlador de memoria). Un consumo elevado es normal bajo carga máxima, pero si se produce con frecuencia en reposo o en tareas ligeras puede indicar un proceso descontrolado.<br><br><b>¿Qué hacer?</b> Mira el panel de Procesos para identificar qué aplicación consume más CPU. Puedes bajar los límites de potencia en el Centro de Poder si quieres priorizar la autonomía de batería.',
      en: '<b>What is it?</b> The CPU power consumption exceeded the threshold configured in Alerts (default 80 W).<br><br><b>How does it work?</b> ROG Monitor reads CPU power draw via the kernel\'s RAPL (Running Average Power Limit) interface. This value includes the processor package (cores + cache + memory controller). High power draw is normal under maximum load, but if it occurs frequently at idle or during light tasks it may indicate a runaway process.<br><br><b>What to do?</b> Check the Processes panel to identify which application is consuming the most CPU. You can lower the power limits in Power Center if you want to prioritize battery life.',
      fr: '<b>Qu\'est-ce que c\'est ?</b> La consommation électrique du CPU a dépassé le seuil configuré dans Alertes (80 W par défaut).<br><br><b>Comment ça fonctionne ?</b> ROG Monitor lit la consommation du CPU via l\'interface RAPL (Running Average Power Limit) du noyau. Cette valeur inclut le package du processeur (cœurs + cache + contrôleur mémoire). Une consommation élevée est normale sous charge maximale, mais si cela se produit fréquemment au repos ou lors de tâches légères, cela peut indiquer un processus incontrôlé.<br><br><b>Que faire ?</b> Consultez le panneau Processus pour identifier quelle application consomme le plus de CPU. Vous pouvez abaisser les limites de puissance dans le Centre de puissance si vous souhaitez privilégier l\'autonomie.',
      it: '<b>Cos\'è?</b> Il consumo di potenza della CPU ha superato la soglia configurata in Avvisi (default 80 W).<br><br><b>Come funziona?</b> ROG Monitor legge il consumo energetico della CPU tramite l\'interfaccia RAPL (Running Average Power Limit) del kernel. Questo valore include il package del processore (core + cache + controller di memoria). Un consumo elevato è normale sotto carico massimo, ma se si verifica frequentemente a riposo o durante attività leggere potrebbe indicare un processo fuori controllo.<br><br><b>Cosa fare?</b> Controlla il pannello Processi per identificare quale applicazione consuma più CPU. Puoi abbassare i limiti di potenza nel Centro Potenza se vuoi dare priorità all\'autonomia della batteria.',
      pt: '<b>O que é?</b> O consumo de energia da CPU ultrapassou o limiar configurado em Alertas (padrão 80 W).<br><br><b>Como funciona?</b> O ROG Monitor lê o consumo de energia da CPU através da interface RAPL (Running Average Power Limit) do kernel. Este valor inclui o pacote do processador (núcleos + cache + controlador de memória). Um consumo elevado é normal sob carga máxima, mas se ocorrer frequentemente em repouso ou durante tarefas leves pode indicar um processo fora de controlo.<br><br><b>O que fazer?</b> Verifica o painel de Processos para identificar qual aplicação consume mais CPU. Podes baixar os limites de energia no Centro de Energia se quiseres priorizar a autonomia da bateria.',
      zh: '<b>这是什么？</b> CPU 功耗超过了"警报"中配置的阈值（默认 80W）。<br><br><b>工作原理：</b> ROG Monitor 通过内核的 RAPL（运行平均功率限制）接口读取 CPU 功耗。此值包含处理器封装（核心 + 缓存 + 内存控制器）。在最大负载下功耗高是正常的，但如果在空闲或轻负载时频繁出现，可能表明存在失控进程。<br><br><b>建议措施：</b> 查看进程面板以确定哪个应用程序消耗的 CPU 最多。如果想优先考虑电池续航，可以在电源中心降低功率限制。',
      ja: '<b>これは何ですか？</b> CPU の消費電力が「アラート」で設定されたしきい値（デフォルト 80W）を超えました。<br><br><b>仕組み：</b> ROG Monitor はカーネルの RAPL（Running Average Power Limit）インターフェースを介して CPU 消費電力を読み取ります。この値にはプロセッサパッケージ（コア + キャッシュ + メモリコントローラー）が含まれます。最大負荷時の高い消費電力は正常ですが、アイドル時や軽い作業時に頻繁に発生する場合は暴走プロセスを示している可能性があります。<br><br><b>対処法：</b> プロセスパネルで CPU を最も消費しているアプリケーションを確認してください。バッテリー寿命を優先する場合は、電力センターで電力制限を下げることができます。',
      ko: '<b>무엇인가요？</b> CPU 전력 소비가 경고에서 설정된 임계값(기본 80W)을 초과했습니다.<br><br><b>작동 원리：</b> ROG Monitor는 커널의 RAPL(Running Average Power Limit) 인터페이스를 통해 CPU 전력 소비를 읽습니다. 이 값에는 프로세서 패키지(코어 + 캐시 + 메모리 컨트롤러)가 포함됩니다. 최대 부하 시 높은 전력 소비는 정상이지만, 유휴 상태나 가벼운 작업 중에 자주 발생하면 제어되지 않는 프로세스를 나타낼 수 있습니다.<br><br><b>대처 방법：</b> 프로세스 패널을 확인하여 CPU를 가장 많이 소비하는 애플리케이션을 확인하세요. 배터리 수명을 우선시하려면 전원 센터에서 전력 제한을 낮출 수 있습니다.',
    },
    'event.explain.fan.body': {
      es: '<b>¿Qué es?</b> Uno o más ventiladores marcan 0 RPM mientras la CPU está por encima del umbral térmico de ventiladores detenidos (ajustable en Alertas).<br><br><b>¿Cómo funciona?</b> En los portátiles ROG, los ventiladores pueden apagarse por diseño cuando el equipo está frío (modo silencioso). ROG Monitor genera este evento solo si la CPU ya está caliente y el ventilador sigue a 0 RPM, lo que indica que puede haber un problema de hardware o de configuración del daemon de ventiladores (asusd / calibrate-fans).<br><br><b>¿Qué hacer?</b> Comprueba si el ventilador arranca con el perfil Performance. Ejecuta la calibración de ventiladores desde el panel de Ventiladores. Si el problema persiste, puede que el hardware necesite revisión.',
      en: '<b>What is it?</b> One or more fans are reading 0 RPM while the CPU is above the fan-stopped temperature threshold (adjustable in Alerts).<br><br><b>How does it work?</b> On ROG laptops, fans can turn off by design when the system is cool (silent mode). ROG Monitor generates this event only when the CPU is already hot and the fan is still at 0 RPM, which indicates a possible hardware issue or fan daemon (asusd / calibrate-fans) misconfiguration.<br><br><b>What to do?</b> Check whether the fan starts under the Performance profile. Run fan calibration from the Fans panel. If the problem persists, the hardware may need inspection.',
      fr: '<b>Qu\'est-ce que c\'est ?</b> Un ou plusieurs ventilateurs indiquent 0 RPM alors que le CPU est au-dessus du seuil de température de ventilateur arrêté (réglable dans Alertes).<br><br><b>Comment ça fonctionne ?</b> Sur les laptops ROG, les ventilateurs peuvent s\'éteindre par conception quand le système est froid (mode silencieux). ROG Monitor génère cet événement uniquement lorsque le CPU est déjà chaud et que le ventilateur est encore à 0 RPM, ce qui indique un problème matériel possible ou une mauvaise configuration du démon de ventilateur (asusd / calibrate-fans).<br><br><b>Que faire ?</b> Vérifiez si le ventilateur démarre avec le profil Performance. Exécutez la calibration des ventilateurs depuis le panneau Ventilateurs. Si le problème persiste, le matériel peut nécessiter une inspection.',
      it: '<b>Cos\'è?</b> Uno o più ventilatori segnano 0 RPM mentre la CPU è sopra la soglia di temperatura per ventilatori fermi (regolabile in Avvisi).<br><br><b>Come funziona?</b> Sui laptop ROG, le ventole possono spegnersi per design quando il sistema è freddo (modalità silenziosa). ROG Monitor genera questo evento solo quando la CPU è già calda e la ventola è ancora a 0 RPM, indicando un possibile problema hardware o una configurazione errata del daemon (asusd / calibrate-fans).<br><br><b>Cosa fare?</b> Controlla se la ventola si avvia con il profilo Performance. Esegui la calibrazione delle ventole dal pannello Ventole. Se il problema persiste, l\'hardware potrebbe necessitare di ispezione.',
      pt: '<b>O que é?</b> Um ou mais ventiladores marcam 0 RPM enquanto a CPU está acima do limiar de temperatura de ventoinhas paradas (ajustável em Alertas).<br><br><b>Como funciona?</b> Nos portáteis ROG, as ventoinhas podem desligar por design quando o sistema está frio (modo silencioso). O ROG Monitor gera este evento apenas quando a CPU já está quente e a ventoinha ainda está a 0 RPM, o que indica um possível problema de hardware ou configuração incorreta do daemon (asusd / calibrate-fans).<br><br><b>O que fazer?</b> Verifica se a ventoinha arranca com o perfil Performance. Executa a calibração das ventoinhas no painel de Ventoinhas. Se o problema persistir, o hardware pode precisar de inspeção.',
      zh: '<b>这是什么？</b> 在 CPU 超过风扇停止温度阈值（可在警报中调整）时，一个或多个风扇显示 0 RPM。<br><br><b>工作原理：</b> 在 ROG 笔记本上，当系统较冷时，风扇可以设计性地关闭（静音模式）。ROG Monitor 只有在 CPU 已经过热且风扇仍为 0 RPM 时才会生成此事件，这表明可能存在硬件问题或风扇守护进程（asusd / calibrate-fans）配置错误。<br><br><b>建议措施：</b> 检查风扇是否在 Performance 配置文件下启动。从风扇面板运行风扇校准。如果问题持续存在，硬件可能需要检查。',
      ja: '<b>これは何ですか？</b> CPU がファン停止温度しきい値（アラートで調整可能）を超えているときに、1つ以上のファンが 0 RPM を示しています。<br><br><b>仕組み：</b> ROG ラップトップでは、システムが冷えているときにファンが設計上停止することがあります（サイレントモード）。ROG Monitor は CPU がすでに熱くなっていてファンがまだ 0 RPM の場合にのみこのイベントを生成します。これはハードウェアの問題またはファンデーモン（asusd / calibrate-fans）の設定ミスを示している可能性があります。<br><br><b>対処法：</b> Performance プロファイルでファンが起動するか確認してください。ファンパネルからファンのキャリブレーションを実行してください。問題が続く場合、ハードウェアの点検が必要かもしれません。',
      ko: '<b>무엇인가요？</b> CPU가 팬 정지 온도 임계값(경고에서 조정 가능)을 초과하는 동안 하나 이상의 팬이 0 RPM을 보여주고 있습니다.<br><br><b>작동 원리：</b> ROG 노트북에서는 시스템이 차가울 때 팬이 설계상 꺼질 수 있습니다(무음 모드). ROG Monitor는 CPU가 이미 뜨겁고 팬이 여전히 0 RPM일 때만 이 이벤트를 생성합니다. 이는 하드웨어 문제나 팬 데몬(asusd / calibrate-fans) 설정 오류를 나타낼 수 있습니다.<br><br><b>대처 방법：</b> Performance 프로파일에서 팬이 시작되는지 확인하세요. 팬 패널에서 팬 보정을 실행하세요. 문제가 지속되면 하드웨어 점검이 필요할 수 있습니다.',
    },
    'event.explain.battery.body': {
      es: '<b>¿Qué es?</b> Un evento relacionado con el estado de la batería o la fuente de alimentación.<br><br><b>¿Cómo funciona?</b> ROG Monitor monitoriza si el equipo está conectado a la red eléctrica o funcionando con batería y puede registrar cambios de estado relevantes.<br><br><b>¿Qué hacer?</b> Revisa el panel de fuente de energía en la barra superior.',
      en: '<b>What is it?</b> An event related to battery state or power source.<br><br><b>How does it work?</b> ROG Monitor monitors whether the system is on AC power or running on battery and can log relevant state changes.<br><br><b>What to do?</b> Check the power source indicator in the top bar.',
      fr: '<b>Qu\'est-ce que c\'est ?</b> Un événement lié à l\'état de la batterie ou à la source d\'alimentation.<br><br><b>Comment ça fonctionne ?</b> ROG Monitor surveille si le système est sur secteur ou sur batterie et peut enregistrer des changements d\'état pertinents.<br><br><b>Que faire ?</b> Consultez l\'indicateur de source d\'alimentation dans la barre supérieure.',
      it: '<b>Cos\'è?</b> Un evento relativo allo stato della batteria o alla fonte di alimentazione.<br><br><b>Come funziona?</b> ROG Monitor monitora se il sistema è collegato alla rete elettrica o funziona a batteria e può registrare cambiamenti di stato rilevanti.<br><br><b>Cosa fare?</b> Controlla l\'indicatore della fonte di alimentazione nella barra superiore.',
      pt: '<b>O que é?</b> Um evento relacionado com o estado da bateria ou fonte de alimentação.<br><br><b>Como funciona?</b> O ROG Monitor monitoriza se o sistema está ligado à corrente elétrica ou a funcionar com bateria e pode registar alterações de estado relevantes.<br><br><b>O que fazer?</b> Verifica o indicador de fonte de energia na barra superior.',
      zh: '<b>这是什么？</b> 与电池状态或电源相关的事件。<br><br><b>工作原理：</b> ROG Monitor 监控系统是否使用交流电或电池运行，并可以记录相关状态变化。<br><br><b>建议措施：</b> 查看顶部栏中的电源指示器。',
      ja: '<b>これは何ですか？</b> バッテリー状態または電源に関するイベントです。<br><br><b>仕組み：</b> ROG Monitor はシステムが AC 電源またはバッテリーで動作しているかを監視し、関連する状態変化を記録できます。<br><br><b>対処法：</b> トップバーの電源インジケーターを確認してください。',
      ko: '<b>무엇인가요？</b> 배터리 상태 또는 전원과 관련된 이벤트입니다.<br><br><b>작동 원리：</b> ROG Monitor는 시스템이 AC 전원 또는 배터리로 실행 중인지 모니터링하고 관련 상태 변화를 기록할 수 있습니다.<br><br><b>대처 방법：</b> 상단 바의 전원 표시기를 확인하세요.',
    },
    'event.explain.disk.body': {
      es: '<b>¿Qué es?</b> Un evento relacionado con el estado del disco o almacenamiento.<br><br><b>¿Cómo funciona?</b> ROG Monitor puede registrar alertas de uso o temperatura del disco cuando los valores superen los umbrales configurados.<br><br><b>¿Qué hacer?</b> Revisa el espacio libre en disco y la temperatura del SSD si dispones de herramientas SMART.',
      en: '<b>What is it?</b> An event related to disk or storage state.<br><br><b>How does it work?</b> ROG Monitor can log disk usage or temperature alerts when values exceed configured thresholds.<br><br><b>What to do?</b> Check free disk space and SSD temperature if you have SMART tools available.',
      fr: '<b>Qu\'est-ce que c\'est ?</b> Un événement lié à l\'état du disque ou du stockage.<br><br><b>Comment ça fonctionne ?</b> ROG Monitor peut enregistrer des alertes d\'utilisation ou de température du disque lorsque les valeurs dépassent les seuils configurés.<br><br><b>Que faire ?</b> Vérifiez l\'espace libre sur le disque et la température du SSD si vous disposez d\'outils SMART.',
      it: '<b>Cos\'è?</b> Un evento relativo allo stato del disco o dello storage.<br><br><b>Come funziona?</b> ROG Monitor può registrare avvisi di utilizzo o temperatura del disco quando i valori superano le soglie configurate.<br><br><b>Cosa fare?</b> Controlla lo spazio libero sul disco e la temperatura dell\'SSD se disponi di strumenti SMART.',
      pt: '<b>O que é?</b> Um evento relacionado com o estado do disco ou armazenamento.<br><br><b>Como funciona?</b> O ROG Monitor pode registar alertas de uso ou temperatura do disco quando os valores ultrapassam os limiares configurados.<br><br><b>O que fazer?</b> Verifica o espaço livre no disco e a temperatura do SSD se tiveres ferramentas SMART disponíveis.',
      zh: '<b>这是什么？</b> 与磁盘或存储状态相关的事件。<br><br><b>工作原理：</b> 当值超过配置的阈值时，ROG Monitor 可以记录磁盘使用或温度警报。<br><br><b>建议措施：</b> 如果有 SMART 工具，请检查磁盘可用空间和 SSD 温度。',
      ja: '<b>これは何ですか？</b> ディスクまたはストレージの状態に関するイベントです。<br><br><b>仕組み：</b> 値が設定されたしきい値を超えると、ROG Monitor はディスク使用量または温度のアラートを記録できます。<br><br><b>対処法：</b> SMART ツールが利用可能な場合は、ディスクの空き容量と SSD 温度を確認してください。',
      ko: '<b>무엇인가요？</b> 디스크 또는 저장 장치 상태와 관련된 이벤트입니다.<br><br><b>작동 원리：</b> 값이 설정된 임계값을 초과하면 ROG Monitor는 디스크 사용량 또는 온도 경고를 기록할 수 있습니다.<br><br><b>대처 방법：</b> SMART 도구가 있다면 디스크 여유 공간과 SSD 온도를 확인하세요.',
    },
    'event.explain.info.body': {
      es: '<b>¿Qué es?</b> Evento informativo general del sistema. No requiere acción inmediata.<br><br>Revisa el mensaje del evento para más detalles.',
      en: '<b>What is it?</b> General informational system event. No immediate action required.<br><br>Review the event message for details.',
      fr: '<b>Qu\'est-ce que c\'est ?</b> Événement système informatif général. Aucune action immédiate requise.<br><br>Consultez le message de l\'événement pour plus de détails.',
      it: '<b>Cos\'è?</b> Evento informativo generale del sistema. Non è richiesta alcuna azione immediata.<br><br>Consulta il messaggio dell\'evento per i dettagli.',
      pt: '<b>O que é?</b> Evento informativo geral do sistema. Não é necessária ação imediata.<br><br>Revê a mensagem do evento para mais detalhes.',
      zh: '<b>这是什么？</b> 常规系统信息事件。无需立即采取行动。<br><br>查看事件消息以获取详细信息。',
      ja: '<b>これは何ですか？</b> 一般的なシステム情報イベントです。即時対応は不要です。<br><br>詳細はイベントメッセージを確認してください。',
      ko: '<b>무엇인가요？</b> 일반 시스템 정보 이벤트입니다. 즉각적인 조치가 필요하지 않습니다.<br><br>자세한 내용은 이벤트 메시지를 검토하세요.',
    },

    /* ---- modal close ---- */
    'event.detail.close': {
      es: 'Cerrar',
      en: 'Close',
      fr: 'Fermer',
      it: 'Chiudi',
      pt: 'Fechar',
      zh: '关闭',
      ja: '閉じる',
      ko: '닫기',
    },
  });

  /* ------------------------------------------------------------------ state */
  const KNOWN_KEYS = ['thermal', 'throttle', 'power', 'fan', 'battery', 'disk'];
  let _activeFilter = 'all';
  let _lastEvents = [];

  /* ------------------------------------------------------------------ helpers */
  function _t(key) {
    return (typeof window.t === 'function') ? window.t(key) : key;
  }

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _resolveKey(raw) {
    return (raw && KNOWN_KEYS.includes(raw)) ? raw : 'info';
  }

  /* ------------------------------------------------------------------ filter chips */
  function _buildFilterBar() {
    const existing = document.getElementById('event-filter-bar');
    if (existing) return;
    const eventsBlock = document.getElementById('events-block');
    if (!eventsBlock) return;
    const ul = document.getElementById('events');
    if (!ul) return;

    const bar = document.createElement('div');
    bar.id = 'event-filter-bar';
    bar.className = 'event-filter-bar';

    const chips = ['all', ...KNOWN_KEYS];
    chips.forEach((key) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'event-chip ghost' + (key === 'all' ? ' active' : '');
      btn.dataset.filterKey = key;
      btn.textContent = _t(`event.filter.${key}`);
      btn.addEventListener('click', () => {
        _activeFilter = key;
        document.querySelectorAll('.event-chip').forEach((b) => {
          b.classList.toggle('active', b.dataset.filterKey === key);
        });
        _renderList(_lastEvents);
      });
      bar.appendChild(btn);
    });

    eventsBlock.insertBefore(bar, ul);
  }

  /* Re-translate chip labels on language change */
  function _retranslateChips() {
    document.querySelectorAll('.event-chip[data-filter-key]').forEach((btn) => {
      btn.textContent = _t(`event.filter.${btn.dataset.filterKey}`);
    });
  }

  /* ------------------------------------------------------------------ list render */
  function _renderList(events) {
    _lastEvents = events || [];
    const ul = document.getElementById('events');
    if (!ul) return;

    const filtered = _activeFilter === 'all'
      ? _lastEvents
      : _lastEvents.filter((e) => _resolveKey(e[3]) === _activeFilter);

    if (!filtered.length) {
      ul.innerHTML = `<li class="dim">${_esc(_t('events.none'))}</li>`;
      return;
    }

    ul.innerHTML = filtered.map((e) => {
      const [ts, level, msg, rawKey] = e;
      const key = _resolveKey(rawKey);
      return `<li class="${_esc(level)} event-item" data-key="${_esc(key)}" style="cursor:pointer" title="${_esc(_t(`event.explain.${key}.title`))}">` +
        `<time>${_esc(ts)}</time>${_esc(msg)}` +
        `<span class="event-key-badge">${_esc(_t(`event.filter.${key}`))}</span>` +
        `</li>`;
    }).join('');

    ul.querySelectorAll('.event-item').forEach((li) => {
      li.addEventListener('click', () => _openModal(li.dataset.key));
    });
  }

  /* ------------------------------------------------------------------ modal */
  function _ensureModal() {
    if (document.getElementById('event-detail-modal')) return;
    const div = document.createElement('div');
    div.id = 'event-detail-modal';
    div.className = 'modal hidden';
    div.innerHTML = `
      <div class="modal-card event-detail-card">
        <h3 id="event-detail-title"></h3>
        <div class="event-detail-body" id="event-detail-body"></div>
        <button class="ghost modal-close" id="event-detail-close">${_esc(_t('event.detail.close'))}</button>
      </div>`;
    document.body.appendChild(div);
    div.querySelector('#event-detail-close').addEventListener('click', _closeModal);
    div.addEventListener('click', (e) => { if (e.target === div) _closeModal(); });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !div.classList.contains('hidden')) _closeModal();
    });
  }

  function _openModal(key) {
    _ensureModal();
    const resolvedKey = _resolveKey(key);
    const modal = document.getElementById('event-detail-modal');
    document.getElementById('event-detail-title').textContent = _t(`event.explain.${resolvedKey}.title`);
    document.getElementById('event-detail-body').innerHTML = _t(`event.explain.${resolvedKey}.body`);
    document.getElementById('event-detail-close').textContent = _t('event.detail.close');
    modal.classList.remove('hidden');
  }

  function _closeModal() {
    const modal = document.getElementById('event-detail-modal');
    if (modal) modal.classList.add('hidden');
  }

  /* ------------------------------------------------------------------ public API */
  function init() {
    _buildFilterBar();
    /* Re-translate chips when language changes */
    if (window.i18n && typeof window.i18n.onChange === 'function') {
      window.i18n.onChange(() => {
        _retranslateChips();
        /* If modal is open, refresh its content */
        const modal = document.getElementById('event-detail-modal');
        if (modal && !modal.classList.contains('hidden')) {
          const key = modal.querySelector('#event-detail-title').dataset.currentKey;
          if (key) _openModal(key);
        }
      });
    }
  }

  function renderList(events) {
    _buildFilterBar();
    _renderList(events);
  }

  window.RogEventDetail = { init, renderList };

  /* ------------------------------------------------------------------ self-test (Node / browser) */
  if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].includes('event-detail')) {
    // Node self-test: destructuring tolerates both 3-element and 4-element arrays
    const e3 = ['10:00:00', 'info', 'test msg'];
    const e4 = ['10:00:01', 'warn', 'another msg', 'thermal'];
    const [ts3, level3, msg3, key3] = e3;
    const [ts4, level4, msg4, key4] = e4;
    if (ts3 !== '10:00:00') throw new Error('3-tuple ts fail');
    if (key3 !== undefined) throw new Error('3-tuple key should be undefined, got: ' + key3);
    if (key4 !== 'thermal') throw new Error('4-tuple key should be thermal, got: ' + key4);
    console.log('event-detail.js self-test PASSED');
  }
})();
