const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const testApi = async () => {
    try {
        const apiKey = process.env.UNIPASS_API_KEY || 'r240a266b083p361j040i080z0';
        const hblNo = '2603190021';
        const blYy = new Date().getFullYear().toString();
        const url = `https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo`;
        
        console.log(`[API 호출] ${hblNo} (${blYy}) ...`);
        const response = await axios.get(url, {
            params: { crkyCn: apiKey, hblNo: hblNo, blYy: blYy }
        });

        console.log("Raw Response:");
        console.log(response.data.substring(0, 1000));
        
        const $ = cheerio.load(response.data, { xmlMode: true });
        
        const info = {};
        $('*').each((i, el) => {
            const tagName = el.tagName;
            const text = $(el).children().length === 0 ? $(el).text() : '[has children]';
            if (tagName !== 'cargCsclPrgsInfoQryRtnVo' && tagName !== 'cargCsclPrgsInfoDtlQryVo') {
                if ($(el).children().length === 0) {
                    info[tagName] = text;
                }
            }
        });
        
        console.log("\nExtracted Tags:");
        console.log(info);
    } catch (e) {
        console.error(e);
    }
}
testApi();
