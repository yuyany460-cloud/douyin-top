/* ============================================================
   抖音千万粉博主名录 —— 前端逻辑
   纯静态，无依赖。双击 index.html 即可运行。
   数据来源：data.js（window.DY_DATA）
             找不到时回退到 fetch('data.json')（需本地服务器）
   ============================================================ */

(function () {
  'use strict';

  var state = {
    all: [],
    meta: {},
    categories: [],
    keyword: '',
    category: '全部',
    sort: 'followers-desc'
  };

  var $grid    = document.getElementById('grid');
  var $chips   = document.getElementById('chips');
  var $q       = document.getElementById('q');
  var $sort    = document.getElementById('sort');
  var $stats   = document.getElementById('stats');
  var $empty   = document.getElementById('empty');
  var $sub     = document.getElementById('subtitle');
  var $note    = document.getElementById('note');

  /* ---------- 工具 ---------- */

  // 30,000,000 -> "3000万"  /  100,000,000 -> "1亿"
  function fmtFollowers(n) {
    if (n >= 100000000) {
      var yi = n / 100000000;
      return (yi % 1 === 0 ? yi : yi.toFixed(1)) + '亿';
    }
    return Math.round(n / 10000) + '万';
  }

  // 由昵称生成稳定的头像配色
  function colorOf(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) % 360;
    }
    return 'linear-gradient(135deg, hsl(' + h + ',68%,54%), hsl(' + ((h + 42) % 360) + ',68%,44%))';
  }

  function initialOf(name) {
    // 中文取首字，英文取首字母
    var m = name.match(/[A-Za-z]/);
    if (m && name.charCodeAt(0) < 128) return name[0].toUpperCase();
    return name.charAt(0);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- 渲染 ---------- */

  function renderStats() {
    var total = state.all.length;
    var cats = {};
    state.all.forEach(function (c) { cats[c.category] = 1; });
    var catCount = Object.keys(cats).length;
    var top = state.all.reduce(function (a, b) {
      return b.followers > a.followers ? b : a;
    }, state.all[0]);
    var sum = state.all.reduce(function (s, c) { return s + c.followers; }, 0);

    $stats.innerHTML =
      stat(total, '位博主') +
      stat(catCount, '个领域') +
      stat(fmtFollowers(top.followers), '最高粉丝') +
      stat(fmtFollowers(sum), '粉丝总量');

    function stat(v, label) {
      return '<div class="stat"><b>' + esc(v) + '</b><span>' + esc(label) + '</span></div>';
    }
  }

  function renderChips() {
    var counts = { '全部': state.all.length };
    state.all.forEach(function (c) {
      counts[c.category] = (counts[c.category] || 0) + 1;
    });

    // 顺序：全部 → 预设领域顺序 → 其余
    var order = ['全部'].concat(state.categories).filter(function (k) { return counts[k]; });
    Object.keys(counts).forEach(function (k) {
      if (order.indexOf(k) === -1) order.push(k);
    });

    $chips.innerHTML = order.map(function (k) {
      return '<button class="chip' + (state.category === k ? ' on' : '') + '" data-cat="' + esc(k) + '">'
           + esc(k) + '<span class="n">' + counts[k] + '</span></button>';
    }).join('');
  }

  /* ---------- 主页链接 ---------- */

  /**
   * 返回该博主的抖音入口地址。
   *
   * 优先使用数据里的 url 字段（形如 https://www.douyin.com/user/<sec_uid>）。
   * 没有时回退到抖音的【用户搜索】—— 抖音对自动化访问会上验证码，
   * 无法批量获取 sec_uid，所以只能以搜索页作为入口；
   * 在已登录的浏览器里，搜索结果第一条即本人主页。
   */
  function profileUrl(c) {
    if (c.url) return c.url;
    return 'https://www.douyin.com/search/' + encodeURIComponent(c.name) + '?type=user';
  }

  function cardHTML(c) {
    var tags = (c.tags || []).map(function (t) {
      return '<span class="tag">' + esc(t) + '</span>';
    }).join('');

    var real = c.realName
      ? '<p class="real">本名 ' + esc(c.realName) + '</p>'
      : '';

    var direct = !!c.url;
    var hint = direct ? '打开抖音主页' : '在抖音搜索该博主';

    return ''
      + '<a class="card" href="' + esc(profileUrl(c)) + '"'
      +    ' target="_blank" rel="noopener noreferrer" title="' + esc(hint) + '">'
      +   '<div class="card-top">'
      +     '<div class="avatar" style="background:' + colorOf(c.name) + '">' + esc(initialOf(c.name)) + '</div>'
      +     '<div class="who">'
      +       '<h2 class="name">' + esc(c.name) + '</h2>'
      +       real
      +     '</div>'
      +     '<div class="followers">'
      +       '<b>' + fmtFollowers(c.followers) + '</b>'
      +       '<span>粉丝</span>'
      +     '</div>'
      +   '</div>'
      +   '<p class="bio">' + esc(c.bio) + '</p>'
      +   '<div class="card-foot">'
      +     '<span class="cat">' + esc(c.category) + '</span>'
      +     tags
      +     '<span class="go' + (direct ? ' direct' : '') + '">'
      +       (direct ? '主页' : '抖音搜索') + ' <i>→</i>'
      +     '</span>'
      +   '</div>'
      + '</a>';
  }

  function visibleList() {
    var kw = state.keyword.trim().toLowerCase();

    var list = state.all.filter(function (c) {
      if (state.category !== '全部' && c.category !== state.category) return false;
      if (!kw) return true;
      var hay = [c.name, c.realName, c.bio, c.category]
        .concat(c.tags || []).join(' ').toLowerCase();
      return hay.indexOf(kw) !== -1;
    });

    if (state.sort === 'followers-desc') {
      list.sort(function (a, b) { return b.followers - a.followers; });
    } else if (state.sort === 'followers-asc') {
      list.sort(function (a, b) { return a.followers - b.followers; });
    } else if (state.sort === 'name') {
      list.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh-Hans-CN'); });
    }
    // 'category' 在渲染时分组，此处不排序

    return list;
  }

  function render() {
    var list = visibleList();

    renderChips();

    if (!list.length) {
      $grid.innerHTML = '';
      $empty.hidden = false;
      return;
    }
    $empty.hidden = true;

    if (state.sort === 'category') {
      var groups = {};
      list.forEach(function (c) {
        (groups[c.category] = groups[c.category] || []).push(c);
      });
      var keys = Object.keys(groups).sort(function (a, b) {
        return groups[b].length - groups[a].length;
      });
      $grid.innerHTML = keys.map(function (k) {
        groups[k].sort(function (a, b) { return b.followers - a.followers; });
        return '<h2 class="group-head">' + esc(k) + '　·　' + groups[k].length + ' 位</h2>'
             + groups[k].map(cardHTML).join('');
      }).join('');
    } else {
      $grid.innerHTML = list.map(cardHTML).join('');
    }
  }

  /* ---------- 事件 ---------- */

  $q.addEventListener('input', function () {
    state.keyword = this.value;
    render();
  });

  $sort.addEventListener('change', function () {
    state.sort = this.value;
    render();
  });

  $chips.addEventListener('click', function (e) {
    var btn = e.target.closest('.chip');
    if (!btn) return;
    state.category = btn.dataset.cat;
    render();
  });

  /* ---------- 启动 ---------- */

  function boot(data) {
    state.meta = data.meta || {};
    state.categories = data.categories || [];
    state.all = (data.creators || []).slice();

    // 按阈值过滤（默认 1000 万）
    var threshold = state.meta.threshold || 10000000;
    state.all = state.all.filter(function (c) { return c.followers >= threshold; });

    document.title = state.meta.title || '抖音千万粉博主名录';
    $sub.textContent = '收录粉丝量 ' + fmtFollowers(threshold)
      + ' 以上的公开账号 · 共 ' + state.all.length + ' 位 · 数据整理于 '
      + (state.meta.updated || '—');

    $note.innerHTML = '<b>关于数据：</b>' + esc(state.meta.disclaimer || '')
      + '<br><b>来源：</b>' + esc(state.meta.source || '—');

    renderStats();
    render();
  }

  if (window.DY_DATA) {
    boot(window.DY_DATA);
  } else {
    // 回退：通过本地服务器打开时可读 data.json
    fetch('data.json')
      .then(function (r) { return r.json(); })
      .then(boot)
      .catch(function () {
        $sub.textContent = '数据加载失败';
        $grid.innerHTML = '<p class="empty">读不到数据。<br><br>'
          + '如果你是用浏览器直接打开本页，请确认 <code>data.js</code> 与 '
          + '<code>index.html</code> 在同一个文件夹里。</p>';
      });
  }
})();
