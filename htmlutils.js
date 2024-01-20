import { JSDOM } from 'jsdom';
import { find } from 'unist-util-find';
import parseMarkdown from "parsemarkdown"
import { toHast as mdast2hast, defaultHandlers } from 'mdast-util-to-hast';
import { raw } from 'hast-util-raw';
import { mdast2hastGridTablesHandler, TYPE_TABLE } from '@adobe/mdast-util-gridtables';
import { toHtml } from 'hast-util-to-html';
import createPageBlocks from '@adobe/helix-html-pipeline/src/steps/create-page-blocks.js'
import { html2md } from "@adobe/helix-html2md/src/html2md.js";
import { md2docx } from "@adobe/helix-md2docx";
import fs from "fs";

function getHtmlSelector(blockscope, blockConfig) {
    if (blockscope === 'noblock') {
        return 'body > div';
    } 
    const blockSelector = `.${blockscope.toLowerCase().replace(/\s+/g,' ').trim().replaceAll(' ', '-')}`;
    const column = blockConfig.column.trim();
    const row = blockConfig.row.trim();
    if (column === '*' && row === '*') {
        return blockSelector;
    } 
    const rowSelector = (row === '*') ? ' > div' : ` > div:nth-child(${row})`;
    const columnSelector = (column === '*') ? ' > div' : ` > div:nth-child(${column})`;
    return `${blockSelector}${rowSelector}${columnSelector}`;
}

async function getDntConfig() {
    // TODO: Each consumer can have additional DNT blocks/content hence have merge logic in place
    const dntConfigPath = 'https://main--milo--adobecom.hlx.page/drafts/localization/configs/dnt-config-v2.json';
    const response = await fetch(dntConfigPath);
    if (!response.ok) {
      console.log('DNT Config unvailable.');
      return;
    }
    const dntConfigJson =  await response.json();
    const dntConfig = new Map();
    dntConfigJson.data.forEach(dntBlock => {
        let blockScope = dntBlock.block_scope;
        const blockScopeArray = blockScope.split(',');
        blockScopeArray.forEach(blockScope => {
            blockScope = blockScope.trim();
            const selector = getHtmlSelector(blockScope, dntBlock);
            const pattern = dntBlock.pattern;
            let condition = 'exists';
            let match = '*';
            if (dntBlock.pattern && dntBlock.pattern.length > 0) {
                if (pattern !== '*' && pattern.includes('(')  && pattern.includes(')')) {
                    condition = pattern.substring(0, pattern.indexOf('(')).trim();
                    match = (pattern.substring(pattern.indexOf('(') + 1, pattern.indexOf(')')).split('||')).map(item => item.trim());
                }
            }
            const config = { condition, match, action: dntBlock.action };
            if (dntConfig.has(selector)) {
                dntConfig.get(selector).push(config);
            } else {
                dntConfig.set(selector, [config]);
            }
        });
    });
    // DNT Word Document Inline links
    dntConfig.set('body > div > a', {'condition': 'beginsWith', 'match': ['http://', 'https://'], 'action': 'dnt'});
    return dntConfig;
}

function addDntAttribute(selector, operations, document) {
    document.querySelectorAll(selector).forEach(function(element) {
        operations.forEach(operation => {
            if (operation.condition === 'exists') {
                element.setAttribute('translate', 'no');
            } else {
                const dntElement = 'dnt-row' === operation.action ? element.parentNode : element;
                const matchTexts = operation.match;
                const elementText = element.textContent;
                if ((operation.condition === 'equals' && matchTexts.includes(elementText))
                 || (operation.condition === 'beginsWith' && matchTexts.some(matchText => elementText.startsWith(matchText)))) { 
                    dntElement.setAttribute('translate', 'no');
                }
            }
        });
    });
}

async function addDntInfoToHtml(html) {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const dntConfig = await getDntConfig();
    dntConfig.forEach((operations, selector) => {
        addDntAttribute(selector, operations, document);
    });
    return dom.serialize();
}

async function fetchText(url) {
    const response = await fetch(url);
    return response.text();
}

async function getPageInfo(path) {
    const htmlUrl = `${path}.plain.html`;
    const mdUrl = `${path}.md`;
    const html = await fetchText(htmlUrl);
    const md = await fetchText(mdUrl);
    return { html, md }
}

function getMdastFromMd(mdContent) {
    const state = { content: { data: mdContent }, log: '' };
    // TODO: currently milo lib is installed - may not be needed in Adobe IO.
    parseMarkdown(state);
    return state.content.mdast;
}

function getHtml(blockMdast) {
    const hast = mdast2hast(blockMdast, {
      handlers: {
        ...defaultHandlers,
        [TYPE_TABLE]: mdast2hastGridTablesHandler(),
      },
      allowDangerousHtml: true,
    });
    const wrappedHast = {
        type: 'element',
        tagName: 'div',
        properties: {},
        children: [raw(hast)]
    };
    const blockInfo = { content: { hast: wrappedHast } };
    createPageBlocks(blockInfo);
    return toHtml(blockInfo.content.hast);
}

function getPageLevelMetadata(md) {
    const mdast = getMdastFromMd(md);
    const metadataNode = find(mdast, (node) =>  (
        node.type === 'gridTable' && find(node, (child) => (child.type === 'text' && (child.value === 'Metadata' || child.value === 'metadata')))
    ));
    return getHtml(metadataNode);
}

async function htmlwithdnt() {
    // TODO: AIO use proxy url with auth header
    // TODO: Convert Excel Json to HTML
    const path = 'https://business.adobe.com/products/audience-manager/learning-resources';
    // const path = 'https://business.adobe.com/products/experience-platform/adobe-experience-platform'
    const { html, md } = await getPageInfo(path);
    const pageLevelMetadata = getPageLevelMetadata(md);
    const htmlwithdnt = await addDntInfoToHtml(`<main>${html}${pageLevelMetadata}</main>`);
    // TODO: to be removed
    fs.writeFile('./output/htmlutils/htmlwithdnt.html', htmlwithdnt, (err) => err && console.error(err));
    return htmlwithdnt;
}

async function html2docx(html) {
    const htmlWithMediaUrls = html.replaceAll('\.\/media_', 'https://main--bacom--adobecom.hlx.page/media_');
    const md = await html2md(htmlWithMediaUrls, { log: console });
    // TODO: to be removed
    fs.writeFile('./output/htmlutils/html2md.md', md, (err) => err && console.error(err));
    // TODO: use custom library to support auth header download of images
    const docxBuffer = await md2docx(md);
    // TODO: to be removed
    fs.writeFile('./output/htmlutils/html2docx.docx', docxBuffer, (err) => err && console.error(err));
}

// TODO: to be removed
const dir = './output/htmlutils';
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}

// TODO: Plug in to actual call in codebase sendHtmlToGLaaS
const htmlWithDnt = await htmlwithdnt();
// TODO: to be replaced with actual GLaaS API response
await html2docx(htmlWithDnt);

