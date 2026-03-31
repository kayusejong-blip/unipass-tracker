const axios = require('axios');
const cheerio = require('cheerio');

// 대장님, 유니패스 오픈 API(API001) 테스트 스크립트입니다.
const CRKY_CN = 'r240a266b083p361j040i080z0'; // 대장님이 주신 인증키
const HBL_NO = '2603130056'; // 테스트용 HBL 번호
const BL_YY = '2026'; // B/L 연도

const testUnipassAPI = async () => {
    try {
        console.log(`--- [v3.0] Unipass Open API Test (API001) ---`);
        console.log(`Target HBL: ${HBL_NO} (${BL_YY})`);

        // API 호출 URL (일반 화물통관진행정보조회)
        const url = `https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo`;
        
        const response = await axios.get(url, {
            params: {
                crkyCn: CRKY_CN,
                hblNo: HBL_NO,
                blYy: BL_YY
            }
        });

        console.log('Response Status:', response.status);
        console.log('--- XML Data Preview ---');
        console.log(response.data.substring(0, 500)); // 처음 500자 출력

        // Cheerio를 사용하여 XML 파싱
        const $ = cheerio.load(response.data, { xmlMode: true });
        
        // 주요 정보 추출 (명세서 기반)
        const cargoMtNo = $('cargMtNo').first().text(); // 화물관리번호
        const prgsStts = $('prgsStts').first().text(); // 통관진행상태
        const mblNo = $('mblNo').first().text(); // M-B/L
        const hblNo = $('hblNo').first().text(); // H-B/L
        const shipNm = $('shcoFlNm').first().text(); // 선박/항공기명
        const lodPortNm = $('lodPortNm').first().text(); // 적재항

        console.log('\n--- Parsed Results ---');
        console.log(`📦 화물관리번호: ${cargoMtNo}`);
        console.log(`🚀 통관진행상태: ${prgsStts}`);
        console.log(`📄 M-B/L No: ${mblNo}`);
        console.log(`📄 H-B/L No: ${hblNo}`);
        console.log(`⚓ 선박/항공기: ${shipNm}`);
        console.log(`🌍 적재항: ${lodPortNm}`);

        // 상세 이력 (최근 단계)
        console.log('\n--- 최근 통관 이력 ---');
        $('cargCsclPrgsInfoDtlQryVo').each((i, el) => {
            if (i < 3) { // 상위 3개만 출력
                const step = $(el).find('cargTrcStepNm').text();
                const time = $(el).find('prcsDttm').text();
                const weight = $(el).find('pckGcnt').text();
                console.log(`[${i+1}] ${time} | ${step} (${weight} PKG)`);
            }
        });

    } catch (e) {
        if (e.response) {
            console.error('API Error Response:', e.response.data);
        } else {
            console.error('Test Error:', e.message);
        }
    }
};

testUnipassAPI();
