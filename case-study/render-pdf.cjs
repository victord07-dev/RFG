const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('C:\\Users\\andre\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\playwright');

async function main() {
  const htmlPath = path.resolve(__dirname, 'rfg-financial-case-study.html');
  const pdfPath = path.resolve(__dirname, 'RFG_Financial_Loan_Operations_Case_Study.pdf');
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome'
  });
  const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const images = Array.from(document.images);
    await Promise.all(images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
    }));
  });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true
  });
  await browser.close();
  console.log(pdfPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
