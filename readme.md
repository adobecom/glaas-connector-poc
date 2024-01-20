## POC for GLaaS Connector HTML Format and Automated DNT

HTML Format (htmlutils > htmlwithdnt()) to be sent to GLaaS
- Uses Hlx plain.html and .md to obtain the block html and page level metadata
- Uses dnt-config-v2 to add attribute translate=no

Convert Translated HTML back to Docx (htmlutils > html2docx)
- Uses hlx library to convert html2md and md to word.
- TODO: in Localization V2 flow use Milo html2md to ensure images are downloaded (VPN and auth flow)

JSON to HTML (jsonutils > json2html)
- To be sent to GLaaS
- DNT support to be added

Translated HTML to JSON to Excel (jsonutils > json2excel)
- Current issue - tab order not retained

Usage
node htmlutils.js
node jsonutils.js 
For sample urls in the code, the corresponding files are generated and saved in output directory
