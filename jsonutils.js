import xlsx from "xlsx"
import fs from "fs";
import { JSDOM } from 'jsdom';

async function fetchText(url) {
    const response = await fetch(url);
    return response.text();
}

async function json2html(url) {

    function createDataDiv(dataJson, name) {
        const { total, offset, limit, data } = dataJson;
        const div = document.createElement('div');
        div.setAttribute('total', total);
        div.setAttribute('offset', offset);
        div.setAttribute('limit', limit);
        div.setAttribute('name', name);
        div.setAttribute('data-type', 'sheet');
        if (data && data.length > 0) {
            data.forEach((jsonObject) => {
                const rowDiv =  div.appendChild(document.createElement('div'));
                rowDiv.setAttribute('data-type', 'row');
                const keys = Object.keys(jsonObject);
                keys.forEach((key) => {
                    const span = rowDiv.appendChild(document.createElement('span'));
                    span.setAttribute('key', key);
                    span.setAttribute('data-type', 'col');
                    span.textContent = jsonObject[key];
                });
            });
        }
        document.body.appendChild(div);
    }

    const rawJson = await fetchText(url);
    const json = JSON.parse(rawJson);
    const dom = new JSDOM();
    const document = dom.window.document;
    if (json[':type'] === 'multi-sheet' && json[':names']) {
        json[':names'].forEach((name) => {
           createDataDiv(json[name], name);
        });
    } else {
        createDataDiv(json, 'default');
    }
    const html = dom.serialize();
    // TODO: to be removed
    fs.writeFileSync("./output/jsonutils/json2html.html", html, (err) => err && console.error(err));
}

async function html2json() {
    // TODO: replace with actual GLaaS translated HTML
    const html = fs.readFileSync("./output/jsonutils/json2html.html", 'utf8');
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const sheets =  document.querySelectorAll('body > div[data-type="sheet"]');
    const isSingleSheet = sheets.length == 1;
    var jsonData = {};
    const type = isSingleSheet ? 'sheet' : 'multi-sheet';
    jsonData[':type'] = type;
    jsonData[':names'] = [];
    sheets.forEach(function(sheet) {
        const name = sheet.getAttribute('name');
        let jsonElement = jsonData;
        if (!isSingleSheet) {
            jsonData[':names'].push(name);
            jsonData[name] = {};
            jsonElement = jsonData[name];
        }
        jsonElement['total'] =  sheet.getAttribute('total');
        jsonElement['offset'] =  sheet.getAttribute('offset');
        jsonElement['limit'] = sheet.getAttribute('limit');
        jsonElement['data'] = [];
        sheet.querySelectorAll('div[data-type="row"]').forEach(function(row) {
            const columns = row.children;
            const columnsArray = Array.from(columns);
            const columnJson = {};
            columnsArray.forEach((column) => {
                columnJson[column.getAttribute('key')] = column.textContent;
            });
            jsonElement.data.push(columnJson);
        });
    });
    const jsonString = JSON.stringify(jsonData);
    fs.writeFileSync("./output/jsonutils/html2json.json", jsonString, (err) => err && console.error(err));
    return jsonString;
}

async function json2excel(rawJson) {
    const json = JSON.parse(rawJson);
    const workbook = xlsx.utils.book_new();
    if (json[':type'] === 'multi-sheet' && json[':names']) {
        json[':names'].forEach((name) => {
            const { data } = json[name];
            if (data && data.length > 0) {
                const worksheet = xlsx.utils.json_to_sheet(data);
                xlsx.utils.book_append_sheet(workbook, worksheet, `helix-${name}`);
            }
        });
    } else {
        const { data } = json;
        if (data && data.length > 0) {
            const worksheet = xlsx.utils.json_to_sheet(data);
            xlsx.utils.book_append_sheet(workbook, worksheet, 'helix-default');
        }
    }
    xlsx.writeFile(workbook, "./output/jsonutils/json2xls.xlsx");
    // TODO: MS Graph endpoint to save in sharepoint
}

// TODO: to be removed
const dir = './output/jsonutils';
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}

// await json2html('https://main--milo--adobecom.hlx.page/drafts/localization/configs/config.json')
await json2html('https://main--milo--adobecom.hlx.page/placeholders.json');
const json = await html2json();
await json2excel(json);
