const axios = require('axios');
const cheerio = require('cheerio');

const hblNo = '2603130056';

const test = async () => {
    try {
        console.log('--- Testing Unipass Check (Enhanced) ---');
        
        // 1. 초기 페이지에서 쿠키 및 토큰 획득
        const initRes = await axios.get('https://unipass.customs.go.kr/csp/index.do', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const cookies = (initRes.headers['set-cookie'] || []).map(c => c.split(';')[0]);
        const $init = cheerio.load(initRes.data);
        
        // savedToken 검색 (여러 이름으로 시도)
        let savedToken = $init('input[name="savedToken"]').val() || 
                         $init('input[id="savedToken"]').val() ||
                         initRes.data.match(/savedToken\s*:\s*"([^"]+)"/)?.[1];
        
        console.log('Cookies:', cookies);
        console.log('Saved Token:', savedToken);

        const blYy = new Date().getFullYear();
        
        // 2. 목록 조회 (List)
        const listUrl = `https://unipass.customs.go.kr/csp/myc/bsopspptinfo/cscllgstinfo/ImpCargPrgsInfoMtCtr/retrieveImpCargPrgsInfoLst.do`;
        const listFormData = new URLSearchParams();
        listFormData.append('qryTp', '2');
        listFormData.append('hblNo', hblNo);
        listFormData.append('blYy', blYy.toString());
        listFormData.append('mblNo', '');
        listFormData.append('pageIndex', '1');
        listFormData.append('pageSize', '10');
        if (savedToken) listFormData.append('savedToken', savedToken);

        console.log('Requesting List...');
        const listRes = await axios.post(listUrl, listFormData, {
            headers: {
                'Cookie': cookies.join('; '),
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': 'https://unipass.customs.go.kr/csp/index.do',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        console.log('List Status:', listRes.status);
        if (listRes.data.includes('프로그램 오류발생')) {
            console.error('List Request Error: 프로그램 오류발생');
            return;
        }

        // 화물관리번호(cargMtNo) 추출 시도
        const $list = cheerio.load(listRes.data);
        const cargMtNo = $list('a[onclick*="retrieveImpCargPrgsInfoDtl"]').first().text().trim() || 
                         listRes.data.match(/retrieveImpCargPrgsInfoDtl\('([^']+)'/)?.[1];
        
        console.log('CargMtNo:', cargMtNo);

        if (!cargMtNo) {
            console.log('No shipment found or parsing failed.');
            return;
        }

        // 3. 상세 조회 (Detail)
        const dtlUrl = `https://unipass.customs.go.kr/csp/myc/bsopspptinfo/cscllgstinfo/ImpCargPrgsInfoMtCtr/retrieveImpCargPrgsInfoDtl.do`;
        const dtlFormData = new URLSearchParams();
        dtlFormData.append('cargMtNo', cargMtNo);
        if (savedToken) dtlFormData.append('savedToken', savedToken);

        console.log('Requesting Detail...');
        const dtlRes = await axios.post(dtlUrl, dtlFormData, {
            headers: {
                'Cookie': cookies.join('; '),
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': listUrl,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        console.log('Detail Status:', dtlRes.status);
        const $dtl = cheerio.load(dtlRes.data);
        console.log('Title:', $dtl('title').text());
        console.log('Sample Text:', $dtl('.left').first().text().trim());

    } catch (e) {
        console.error('Test Error:', e.message);
    }
};

test();
