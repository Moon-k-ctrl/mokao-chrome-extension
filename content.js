// content.js - 粉笔模考爬虫 mokao v2.3.0
// v1.6: 彻底修复图片重复问题 - 公式图片只内联不加入数组，popup.js智能去重

// ===== 工具函数 =====
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 判断是否为公式图片
function isFormulaImage(img) {
  const src = img.src || '';
  return src.includes('fbstatic.cn/api/planet/accessories/formulas') || 
         src.includes('fb.fbstatic.cn/api/planet/accessories/formulas') ||
         src.includes('fenbike.cn/api/planet/accessories/formulas');
}

// 判断 SVG 是否为 UI 装饰元素
function isDecorativeSVG(svg) {
  const cls = svg.getAttribute('class') || '';
  if (/toggle-btn/i.test(cls)) return true;
  if (/solution-title-icon/i.test(cls)) return true;
  if (/ng-tns/i.test(cls)) return true;
  const w = parseFloat(svg.getAttribute('width')) || 0;
  const h = parseFloat(svg.getAttribute('height')) || 0;
  if (w > 0 && h > 0 && w <= 30 && h <= 30) return true;
  const vb = svg.getAttribute('viewBox');
  if (vb) {
    const parts = vb.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] <= 30 && parts[3] <= 30) return true;
  }
  return false;
}

// DOM 遍历提取内容（保持公式图片位置，去重，公式图片不加入数组）
function extractContentWithInlineFormulas(element) {
  if (!element) return { text: '', images: [] };
  
  const images = [];  // 只存放普通图片（非公式图片），用于后续下载
  const seenUrls = new Set(); // 用于去重
  let text = '';
  
  function walk(node) {
    if (!node) return;
    
    const tag = node.tagName?.toLowerCase();
    if (['script', 'style', 'noscript'].includes(tag)) return;
    
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
      return;
    }
    
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    
    // 处理图片
    if (tag === 'img') {
      let src = node.src;
      if (src && !src.startsWith('data:')) {
        // 标准化 URL
        if (src.startsWith('//')) src = 'https:' + src;
        
        // 去重：跳过已见过的图片
        if (seenUrls.has(src)) return;
        seenUrls.add(src);
        
        const isFormula = isFormulaImage(node);
        const alt = isFormula ? 'formula' : (node.alt || 'img');
        
        // 始终内联插入 Markdown
        text += ` ![${alt}](${src}) `;
        
        // 只有非公式图片才加入 images 数组（用于下载）
        if (!isFormula) {
          images.push({ src, alt });
        }
      }
      return;
    }
    
    // 处理 SVG
    if (tag === 'svg') {
      if (!isDecorativeSVG(node)) {
        const svgUrl = 'svg_' + Math.random().toString(36).slice(2, 10);
        try {
          const d = new XMLSerializer().serializeToString(node);
          const svgData = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(d)));
          text += ` ![SVG](${svgData}) `;
        } catch(e) {}
      }
      return;
    }
    
    // 处理换行块元素
    if (['p', 'div', 'br', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
      text += '\n';
    }
    
    // 递归处理子节点
    for (const child of node.childNodes) {
      walk(child);
    }
    
    // 块元素后添加换行
    if (['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
      text += '\n';
    }
  }
  
  walk(element);
  
  // 清理文本
  text = text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n /g, '\n')
    .replace(/ \n/g, '\n')
    .trim();
  
  return { text, images };
}

// ===== 滚动加载 =====
async function scrollPage() {
  let stable = 0;
  for (let i = 0; i < 80; i++) {
    const pc = document.querySelectorAll('.question-multiple').length;
    const ph = document.body.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(1000);
    const nc = document.querySelectorAll('.question-multiple').length;
    const nh = document.body.scrollHeight;
    if (nh === ph && nc === pc) { stable++; if (stable >= 3) break; }
    else { stable = 0; }
  }
  window.scrollTo(0, 0);
  await sleep(500);
}

// ===== 自动点击懒加载 Tab =====
async function clickAllTabs() {
  const clicked = [];
  const navTabs = document.querySelectorAll('.tab-item, .exam-tab, .question-tab, [class*="tab"][class*="item"], [class*="nav"][class*="item"]');
  for (const tab of navTabs) {
    const text = tab.innerText?.trim();
    if (text && /\d/.test(text)) { tab.click(); await sleep(300); clicked.push(text); }
  }
  const matTabs = document.querySelectorAll('.material-tab, [class*="material"][class*="tab"]');
  for (const tab of matTabs) { tab.click(); await sleep(300); clicked.push('material:' + (tab.innerText?.trim() || '?')); }
  const expandBtns = document.querySelectorAll('.expand-btn, .toggle-btn, [class*="expand"], [class*="toggle"], [class*="fold"]');
  for (const btn of expandBtns) {
    if (btn.getAttribute('aria-expanded') === 'false' || btn.classList.contains('collapsed')) {
      btn.click(); await sleep(200); clicked.push('expand:' + (btn.innerText?.trim()?.slice(0, 20) || '?'));
    }
  }
  return clicked;
}

// ===== 提取试卷名称 =====
function extractExamTitle() {
  let title = document.title || '';
  title = title.replace(/_粉笔题库_粉笔$/, '').replace(/- 粉笔$/, '').trim();
  
  if (!title || title === '粉笔') {
    const titleSelectors = [
      '.exam-title h1', '.exam-title', '.title h1', '.title',
      '[class*="title"] h1', 'h1[class*="title"]',
      '.header-title', '.page-title', '.main-title'
    ];
    for (const sel of titleSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.innerText?.trim();
        if (text && text.length > 5 && !text.includes('加载中')) {
          title = text;
          break;
        }
      }
    }
  }
  
  if (!title || title === '粉笔') {
    const match = location.pathname.match(/exam\/(\d+)\/(\d+)/);
    if (match) {
      title = `模考_${match[1]}_${match[2]}`;
    }
  }
  
  title = title.replace(/\s+/g, ' ').replace(/[<>"/\\|?*]/g, '_').trim();
  return title || '模考';
}

// ===== 提取分数 =====
function extractScore() {
  // 策略1: 查找分数显示区域（通常在页面顶部统计区）
  const scoreSelectors = [
    '.score-num', '.total-score', '.exam-score', '[class*="score"]',
    '.result-score', '.final-score', '.points'
  ];
  for (const sel of scoreSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = (el.innerText || '').trim();
      const m = text.match(/(\d+(?:\.\d+)?)/);
      if (m) return parseFloat(m[1]);
    }
  }
  
  // 策略2: 从页面文本中搜索分数模式
  const bodyText = document.body.innerText || '';
  // 匹配 "得分：XX" 或 "总分 XX" 或 "XX分" 等模式
  const patterns = [
      /(?:得分|总分|分数)[：:]*\s*(\d+(?:\.\d+)?)/,
      /(?:你的?成绩)[：:]*\s*(\d+(?:\.\d+)?)/,
      /(\d{2,3})(?:\.\d)?\s*分(?![题])/,
      /score[：:]*(\d+(?:\.\d+)?)/i
  ];
  for (const p of patterns) {
    const m = bodyText.match(p);
    if (m) return parseFloat(m[1]);
  }
  
  // 策略3: 根据题目计算（每题分值 * 正确数）
  // 行测一般每题约 0.7-1 分，总分通常 100 分
  return null;  // 无法确定时返回 null
}

// ===== 提取题目 =====
function extractQuestions() {
  const questions = [];
  const containers = document.querySelectorAll('.question-multiple');

  containers.forEach((container, idx) => {
    try {
      // 题号
      const indexEl = container.querySelector('.title-index');
      let number = idx + 1;
      if (indexEl) {
        const m = indexEl.innerText.match(/(\d+)/);
        if (m) number = parseInt(m[1]);
      }

      // 题型
      const typeEl = container.querySelector('.title-type-name');
      const qType = typeEl ? typeEl.innerText.trim() : '';

      // 是否正确
      const tiC = container.querySelector('.ti-container');
      const isCorrect = tiC ? tiC.classList.contains('correct') : false;

      // === 题干（使用新方法，去重）===
      const stemEl = container.querySelector('.ti-content');
      let stemResult = { text: '', images: [] };
      if (stemEl) {
        const stemClone = stemEl.cloneNode(true);
        // 移除选项、答案、解析区域
        ['.choice-radios', '.choice-radios-wrap', '.choice-checks', '.overall-item', '.result-common-container', '.analysis', '.analysis-container'].forEach(sel => {
          stemClone.querySelectorAll(sel).forEach(el => el.remove());
        });
        stemResult = extractContentWithInlineFormulas(stemClone);
        
        // 清理 UI 装饰文字
        stemResult.text = stemResult.text
          .replace(/\s*点击查看答案\s*/g, '')
          .replace(/\s*展开\s*/g, '')
          .replace(/\s*折叠\s*/g, '')
          .replace(/\s*[\u4e00-\u9fa5]+答案\s*/g, '')
          .trim();
      }

      // === 选项（增强提取，支持公式图片）===
      const opts = {};
      const optImgMap = {};

      // 策略1: 标准选项结构 - 使用 DOM 遍历提取每个选项
      const optionSelectors = '.choice-radio, .choice-checkbox, .choice-item, [class*="choice"][class*="item"], [class*="option"], .radio-item, .checkbox-item';
      const optionEls = container.querySelectorAll(optionSelectors);
      
      if (optionEls.length > 0) {
        optionEls.forEach(optEl => {
          // 提取选项字母（多种方式）
          const fullText = optEl.innerText || '';
          let letterMatch = fullText.match(/^([A-F])\s*/);
          if (!letterMatch) {
            const labelEl = optEl.querySelector('.choice-radio-label, .choice-checkbox-label, label, .choice-label');
            if (labelEl) {
              letterMatch = (labelEl.innerText || '').match(/^([A-F])\s*/);
            }
          }
          if (!letterMatch) {
            const dataLetter = optEl.getAttribute('data-option') || optEl.getAttribute('data-letter');
            if (dataLetter) letterMatch = [null, dataLetter.toUpperCase()];
          }
          if (!letterMatch) return;
          
          const letter = letterMatch[1];
          
          // 使用 DOM 遍历提取选项内容（保持公式图片内联）
          const optResult = extractContentWithInlineFormulas(optEl);
          let optText = optResult.text;
          
          // 移除选项字母前缀
          optText = optText.replace(/^[A-F][\s.、:：\uff08]+/, '').trim();
          
          // 如果选项内容为空但有公式图片，使用公式图片的 markdown
          if (!optText && optResult.images.length > 0) {
            optText = optResult.images.map(img => `![${img.alt}](${img.src})`).join(' ');
          }
          
          if (optText) {
            opts[letter] = optText;
            // 记录选项图片（排除公式图片，因为已内联）
            const nonFormulaImgs = optResult.images.filter(img => !img.src.includes('/formulas'));
            if (nonFormulaImgs.length) optImgMap[letter] = nonFormulaImgs;
          }
        });
      }

      // 策略2: 如果策略1没找到选项，尝试从 .choice-radios 容器整体提取
      if (Object.keys(opts).length === 0) {
        const cr = container.querySelector('.choice-radios, .choice-checks, .choices-container');
        if (cr) {
          const optMarkers = cr.querySelectorAll('[class*="choice"], [class*="option"], label, li');
          optMarkers.forEach(marker => {
            // 使用 DOM 遍历提取
            const markerResult = extractContentWithInlineFormulas(marker);
            const raw = markerResult.text;
            
            let m = raw.trim().match(/^([A-F])\s{2,}(.*)$/s);
            if (!m) m = raw.trim().match(/^([A-F])\s*\n(.*)$/s);
            if (!m) m = raw.trim().match(/^([A-F])[.、:：\uff08\s]+(.*)$/s);
            if (!m) return;
            
            const letter = m[1];
            let text = m[2].trim();
            if (!text || /(正确答案|你的答案|全站正确率|答题用时|易错项|考点|来源)/.test(text)) {
              // 使用提取结果
              text = markerResult.text.replace(/^[A-F][\s.、:：\uff08]+/, '').trim();
              if (!text && markerResult.images.length > 0) {
                text = markerResult.images.map(img => `![${img.alt}](${img.src})`).join(' ');
              }
            }
            if (text) opts[letter] = text;
          });
        }
      }

      // 策略3: 全文扫描选项（最后备用）
      if (Object.keys(opts).length === 0) {
        const ct = (container.innerText || '').trim();
        const lines = ct.split('\n');
        let cur = '';
        let inOptionZone = false;
        for (const line of lines) {
          const t = line.trim();
          const singleLetter = t.match(/^([A-F])$/);
          const letterWithContent = t.match(/^([A-F])\s{2,}(.+)$/);
          if (singleLetter) {
            cur = singleLetter[1];
            inOptionZone = true;
          } else if (letterWithContent) {
            opts[letterWithContent[1]] = letterWithContent[2].trim();
            cur = '';
            inOptionZone = true;
          } else if (cur && inOptionZone && t.length > 0) {
            if (!/(正确答案|你的答案|全站正确率|答题用时|易错项|考点|来源|解析|单选题|多选题)/.test(t)) {
              opts[cur] = t;
              cur = '';
            } else {
              cur = '';
              if (/(正确答案|解析)/.test(t)) inOptionZone = false;
            }
          }
        }
      }

      // 清理空选项
      for (const [k, v] of Object.entries(opts)) { if (!v || !v.trim()) delete opts[k]; }

      // === 答案 ===
      let correctAnswer = '', myAnswer = '';
      container.querySelectorAll('.overall-item').forEach(item => {
        const t = item.innerText.trim();
        if (t.includes('正确答案')) { const mm = t.match(/([A-F])/); if (mm) correctAnswer = mm[1]; }
        else if (t.includes('你的答案') || t.includes('我的答案')) { const mm = t.match(/([A-F])/); if (mm) myAnswer = mm[1]; }
      });
      if (!myAnswer && correctAnswer && isCorrect) myAnswer = correctAnswer;

      // === 解析（使用新方法）===
      const aEl = container.querySelector('.result-common-container, .analysis, .analysis-container');
      let analysisResult = { text: '', images: [] };
      if (aEl) {
        analysisResult = extractContentWithInlineFormulas(aEl);
        analysisResult.text = analysisResult.text
          .replace(/^解析[：:：?\s]*/, '')
          .replace(/\n考点[\s\S]*$/, '')
          .replace(/\n来源[\s\S]*$/, '')
          .trim();
      }

      if (number > 0) {
        questions.push({
          number, type: qType, stem: stemResult.text, stemImages: stemResult.images,
          options: opts, optionImageMap: optImgMap,
          correctAnswer, myAnswer,
          analysis: analysisResult.text, analysisImages: analysisResult.images, isCorrect
        });
      }
    } catch (e) { console.error('mokao extract error:', e); }
  });

  // 去重
  const seen = new Set();
  const unique = [];
  for (const q of questions) { if (!seen.has(q.number)) { seen.add(q.number); unique.push(q); } }
  const nums = unique.map(q => q.number).sort((a, b) => a - b);
  const missing = [];
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  for (let i = 1; i <= max; i++) { if (!nums.includes(i)) missing.push(i); }

  return { questions: unique, debug: { total: containers.length, extracted: questions.length, deduped: unique.length, missing } };
}

// ===== 提取材料 =====
function extractMaterials() {
  const mats = [];
  document.querySelectorAll('.materials-container').forEach((c, i) => {
    try {
      const ce = c.querySelector('.material-content');
      if (ce) {
        const result = extractContentWithInlineFormulas(ce);
        mats.push({ index: i, text: result.text, images: result.images });
      }
    } catch (e) { console.error('mokao material error:', e); }
  });
  return mats;
}

// ===== 下载图片 =====
async function downloadAllImages(questions, materials) {
  const stemMap = {}, optMap = {}, analysisMap = {}, matMap = {};
  let total = 0;
  for (const q of questions) {
    total += (q.stemImages || []).length;
    total += Object.values(q.optionImageMap || {}).flat().length;
    total += (q.analysisImages || []).length;
  }
  for (const m of materials) { total += (m.images || []).length; }

  const downloadUrl = async (imgObj) => {
    const url = typeof imgObj === 'string' ? imgObj : (imgObj.src || imgObj);
    const alt = typeof imgObj === 'string' ? 'img' : (imgObj.alt || 'img');
    if (url && url.startsWith('data:')) return { src: url, alt };
    try {
      const resp = await fetch(url, { credentials: 'include' });
      if (!resp.ok) return { src: url, alt, failed: true };
      const blob = await resp.blob();
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve({ src: reader.result, alt });
        reader.onerror = () => resolve({ src: url, alt, failed: true });
        reader.readAsDataURL(blob);
      });
    } catch (e) { return { src: url, alt, failed: true }; }
  };

  const CONCURRENT = 5;
  const downloadBatch = async (imgs) => {
    const results = [];
    for (let i = 0; i < imgs.length; i += CONCURRENT) {
      const batch = imgs.slice(i, i + CONCURRENT);
      results.push(...await Promise.all(batch.map(u => downloadUrl(u))));
    }
    return results;
  };

  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];
    stemMap[qi] = await downloadBatch(q.stemImages || []);
    const om = {};
    for (const [letter, imgs] of Object.entries(q.optionImageMap || {})) { om[letter] = await downloadBatch(imgs); }
    optMap[qi] = om;
    analysisMap[qi] = await downloadBatch(q.analysisImages || []);
  }
  for (let mi = 0; mi < materials.length; mi++) { matMap[mi] = await downloadBatch(materials[mi].images || []); }

  return { stemMap, optMap, analysisMap, matMap, downloaded: 0, total };
}

// ===== 消息处理 =====
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      switch (request.action) {
        case 'ping': sendResponse({ ok: true }); break;
        case 'detect': {
          const containers = document.querySelectorAll('.question-multiple');
          const mats = document.querySelectorAll('.materials-container');
          sendResponse({ 
            isExamPage: containers.length > 0, 
            questionCount: containers.length, 
            materialCount: mats.length, 
            title: extractExamTitle(),
            score: extractScore()
          });
          break;
        }
        case 'click_tabs': { const clicked = await clickAllTabs(); sendResponse({ clicked, count: clicked.length }); break; }
        case 'extract': {
          await scrollPage();
          await clickAllTabs();
          await sleep(500);
          const result = extractQuestions();
          result.title = extractExamTitle();
          result.score = extractScore();
          sendResponse(result);
          break;
        }
        case 'extract_materials': sendResponse({ materials: extractMaterials() }); break;
        case 'download_images': sendResponse(await downloadAllImages(request.questions, request.materials)); break;
        default: sendResponse({ error: 'unknown action' });
      }
    } catch (e) { sendResponse({ error: e.message }); }
  })();
  return true;
});