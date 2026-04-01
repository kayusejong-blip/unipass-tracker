const axios = require('axios');
const sodium = require('libsodium-wrappers');
require('dotenv').config();

async function run() {
    const args = process.argv.slice(2);
    const token = args[0];
    if(!token) {
        console.log('❌ 에러: GitHub 토큰이 필요합니다. 실행 시 띄어쓰기 후 토큰을 붙여 넣어주세요.');
        console.log('예: node auto_set_secrets.cjs ghp_xxxxxxxxxxxxxxxxxxxxxx');
        return;
    }

    const repo = 'kayusejong-blip/unipass-tracker';

    const secrets = {
        'UNIPASS_API_KEY': process.env.UNIPASS_API_KEY,
        'TG_TOKEN': process.env.TG_TOKEN,
        'TG_CHAT_ID': '5826246844'
    };

    if(!secrets.UNIPASS_API_KEY || !secrets.TG_TOKEN) {
        console.log('❌ 에러: .env 파일에서 UNIPASS_API_KEY 또는 TG_TOKEN을 읽어올 수 없습니다.');
        return;
    }

    console.log(`🤖 GitHub Actions 원격 비밀번호 강제 주입 시스템 가동`);
    console.log(`   대상 저장소: ${repo}`);
    console.log(`-----------------------------------------------------`);
    
    try {
        await sodium.ready;
        
        // 1. 저장소 공개 키(Public Key) 가져오기
        console.log(`[요청 1/2] 깃허브 본사 보안 공개키(Public Key) 요청 중...`);
        const { data: keyData } = await axios.get(`https://api.github.com/repos/${repo}/actions/secrets/public-key`, {
            headers: { 
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github.v3+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        const keyId = keyData.key_id;
        const keyBytes = sodium.from_base64(keyData.key, sodium.base64_variants.ORIGINAL);

        // 2. Secret 암호화 & 전송
        console.log(`[요청 2/2] 환경변수 3종 암호화 및 깃허브 본사 저장소에 다이렉트 주입 중...`);
        for (const [secName, secValue] of Object.entries(secrets)) {
            const messageBytes = Buffer.from(secValue);
            const encryptedBytes = sodium.crypto_box_seal(messageBytes, keyBytes);
            const encryptedBase64 = sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);

            await axios.put(`https://api.github.com/repos/${repo}/actions/secrets/${secName}`, {
                encrypted_value: encryptedBase64,
                key_id: keyId
            }, {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github.v3+json',
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });
            console.log(`  💎 [ ${secName} ] 비밀창고 주입 성공!`);
        }

        console.log(`-----------------------------------------------------`);
        console.log(`🎉 [완료] 대장님의 모든 시크릿 키가 깃허브 Actions에 성공적으로 이식되었습니다!`);
        console.log(`🎉 웹 대시보드 환경설정에서도 동일한 토큰을 쓰시면 됩니다.`);
        
    } catch(err) {
        console.error('\n❌ 주입 실패:', err.response ? err.response.data : err.message);
        console.log('\n[주의] 넣으신 토큰에 "repo" 체크박스 권한이 없거나 오타가 난 것 같습니다.');
    }
}

run();
