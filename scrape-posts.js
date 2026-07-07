const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDir = "D:\\website\\blog001\\content\\english\\blog";

async function getAllUrls() {
  const resp = await fetch("https://gujiee.blogspot.com/sitemap.xml");
  const xml = await resp.text();
  const urls = [];
  const regex = /<loc>(https:\/\/gujiee\.blogspot\.com\/\d{4}\/\d{2}\/[^<]+)<\/loc>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    if (match[1].includes("blog-post")) urls.push(match[1]);
  }
  return [...new Set(urls)];
}

function getExistingEndings(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".md") && f !== "_index.md");
  const results = new Set();
  files.forEach(f => {
    const content = fs.readFileSync(path.join(dir, f), "utf8");
    const titleMatch = content.match(/title: "(.+)"$/m);
    if (titleMatch) results.add(titleMatch[1]);
  });
  return results;
}

async function scrapePost(url, browser) {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(1500);
    
    const content = await page.evaluate(() => {
      const els = [".post-body", ".entry-content", ".article-content.entry-content", ".article-content", "[id^=\"post-body\"]"];
      let el = null;
      for (const s of els) {
        const e = document.querySelector(s);
        if (e && e.textContent.trim().length > 50) { el = e; break; }
      }
      if (!el) return { text: "", title: "" };
      const c = el.cloneNode(true);
      c.querySelectorAll("script, iframe, style, .comments").forEach(e => e.remove());
      return { text: c.innerText.trim(), title: (document.querySelector(".post-title, .entry-title, h1") || {}).textContent?.trim() || "" };
    });
    
    await page.close();
    return content;
  } catch (e) {
    await page.close();
    return null;
  }
}

(async () => {
  const allUrls = await getAllUrls();
  const existingTitles = getExistingEndings(outputDir);
  
  console.log(`Total URLs: ${allUrls.length}, Existing: ${existingTitles.size}`);
  
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  let success = 0, fail = 0;
  
  for (let i = 0; i < allUrls.length; i++) {
    const url = allUrls[i];
    const result = await scrapePost(url, browser);
    
    if (!result || !result.text || result.text.length < 20) {
      fail++;
      continue;
    }
    
    if (existingTitles.has(result.title)) {
      continue; // skip duplicates
    }
    existingTitles.add(result.title);
    
    const dateMatch = url.match(/(\d{4})\/(\d{2})/);
    const dateStr = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-15` : "2015-09-01";
    const safeTitle = result.title.substring(0, 60).replace(/[<>:"/\\|?*]/g, "").trim() || `post-${i+1}`;
    
    const md = `---
title: "${result.title.replace(/"/g, "\\\"")}"
date: ${dateStr}T10:00:00+12:00
draft: false
type: "post"
---

${result.text}
`;
    
    let fp = path.join(outputDir, `${safeTitle}.md`);
    let c = 1;
    while (fs.existsSync(fp)) { fp = path.join(outputDir, `${safeTitle}-${c}.md`); c++; }
    fs.writeFileSync(fp, md, "utf8");
    success++;
    process.stdout.write(".");
    if (success % 20 === 0) process.stdout.write(` ${success}`);
  }
  
  await browser.close();
  console.log(`\nDone! New: ${success}, Failed: ${fail}`);
})();
