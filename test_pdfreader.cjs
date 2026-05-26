const fs = require('fs');
const { PdfReader } = require('pdfreader');

function extractText(buffer) {
  return new Promise((resolve, reject) => {
    let fullText = '';
    new PdfReader().parseBuffer(buffer, (err, item) => {
      if (err) return reject(err);
      if (!item) return resolve(fullText);
      if (item.text) {
        fullText += item.text + ' ';
      }
    });
  });
}

const buffer = fs.readFileSync('test.pdf');
extractText(buffer).then(text => console.log(text)).catch(err => console.error(err));
