/**
 * Google Apps Script proxy for live summer instructional pay rates.
 *
 * Deployment:
 * 1. Create a new Apps Script project.
 * 2. Paste this file into the project.
 * 3. Deploy as a web app with public GET access.
 * 4. Copy the web app URL into SUMMER_RATE_PROXY_URL in
 *    Release-Time-and-Overload-Calculator.html.
 */
const SUMMER_PAY_RATE_URL = "https://www.oc.hawaii.edu/faculty_staff/summer/pay_rate-faculty.asp";

function doGet(e) {
  const source = e && e.parameter ? e.parameter.source : "";

  if (source !== "summer-pay-rates") {
    return jsonResponse({
      error: "Unsupported source.",
      supportedSources: ["summer-pay-rates"]
    });
  }

  const html = UrlFetchApp.fetch(SUMMER_PAY_RATE_URL, {
    muteHttpExceptions: true,
    followRedirects: true
  }).getContentText();

  const rates = extractRatesFromHtml(html);

  return jsonResponse({
    sourceUrl: SUMMER_PAY_RATE_URL,
    fetchedAt: new Date().toISOString(),
    rates: rates
  });
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function extractRatesFromHtml(html) {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const rates = [];

  rows.forEach(function (rowHtml) {
    const cells = [];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cleanCellText(cellMatch[1]));
    }

    if (cells.length < 2) {
      return;
    }

    const label = cells[0];
    const value = findNumericValue(cells);

    if (!label || value === null) {
      return;
    }

    if (/rank|title|faculty|classification/i.test(label) && /pay|rate|credit/i.test(cells.join(" "))) {
      return;
    }

    if (/note|effective|subject|summer session/i.test(label)) {
      return;
    }

    rates.push({
      label: label,
      value: value
    });
  });

  if (rates.length === 0) {
    throw new Error("No rate rows were parsed from the UH page.");
  }

  return dedupeRates(rates);
}

function cleanCellText(html) {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function findNumericValue(cells) {
  for (var i = cells.length - 1; i >= 0; i -= 1) {
    var text = cells[i];
    var match = text.match(/\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/);

    if (match) {
      var value = Number(match[1].replace(/,/g, ""));
      if (isFinite(value)) {
        return value;
      }
    }
  }

  return null;
}

function dedupeRates(rates) {
  const seen = {};

  return rates.filter(function (rate) {
    const key = rate.label + "::" + rate.value;

    if (seen[key]) {
      return false;
    }

    seen[key] = true;
    return true;
  });
}
