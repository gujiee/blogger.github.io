const playwright = require('playwright');
const fs = require('fs');
const path = require('path');

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDir = "D:\\website\\blog001\\content\\english\\blog";

async function main() {
  const resp = await fetch("https://gujiee.blogspot.com/sitemap.xml");
  const xml = await resp.text();
  const allUrls = [...new Set([...xml.matchAll(/<loc>(https:\/\/gujiee\.blogspot\.com\/\d{4}\/\d{2}\/[^<]+)<\/loc>/g)].map(m => m[1]))];
  
  const existingTitles = new Set();
  fs.readdirSync(outputDir).filter(f => f.endsWith('.md') && f !== '_index.md').forEach(f => {
    const c = fs.readFileSync(path.join(outputDir, f), 'utf8');
    const m = c.match(/^title: "(.+)"/m);
    if (m) existingTitles.add(m[1]);
  });
  
  console.log("Total URLs:", allUrls.length, "Existing:", existingTitles.size);
  
  const browser = await playwright.chromium.launch({ headless: true, executablePath: chromePath });
  let success = 0, fail = 0;
  
  for (const url of allUrls) {
    let page;
    try {
      page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(2000);
      
      const result = await page.evaluate(() => {
        const sel = ['.post-body', '.entry-content', '.article-content.entry-content', '.article-content', '[id^="post-body"]'];
        let el = null;
        for (const s of sel) {
          const e = document.querySelector(s);
          if (e && e.textContent.trim().length > 50) { el = e; break; }
        }
        if (!el) return { text: '', title: '' };
        const c = el.cloneNode(true);
        c.querySelectorAll('script, iframe, style, .comments').forEach(e => e.remove());
        return { text: c.innerText.trim(), title: (document.querySelector('.post-title, .entry-title, h1') || {}).textContent?.trim() || '' };
      });
      
      if (result.title && existingTitles.has(result.title)) {
        fail++; await page.close(); continue;
      }
      
      if (result.title && result.text.length >= 20) {
        existingTitles.add(result.title);
        const d = url.match(/(\d{4})\/(\d{2})/);
        const ds = d ? d[1] + '-' + d[2] + '-15' : '2015-09-01';
        const st = result.title.substring(0, 60).replace(/[<>:"/\\|?*]/g, '').trim();
        const md = '---\ntitle: "' + result.title.replace(/"/g, '\\"') + '"\ndate: ' + ds + 'T10:00:00+12:00\ndraft: false\ntype: "post"\n---\n\n' + result.text;
        let fp = path.join(outputDir, st + '.md');
        let c = 1;
        while (fs.existsSync(fp)) { fp = path.join(outputDir, st + '-' + c + '.md'); c++; }
        fs.writeFileSync(fp, md, 'utf8');
        success++;
        process.stdout.write('.');
        if (success % 10 === 0) process.stdout.write(' ' + success);
      } else {
        fail++;
        process.stdout.write('x');
      }
      await page.close();
    } catch(e) {
      fail++;
      process.stdout.write('X');
      if (page) await page.close();
    }
  }
  
  await browser.close();
  console.log('\nDone! New:', success, 'Failed:', fail, 'Total:', existingTitles.size);
}

main().catch(e => { console.error(e); process.exit(1); });
