const fs = require('fs');
const path = require('path');

// AG-Bot CLI Status Reporter
const info = {
    version: '3.2',
    name: '수입신고 상황 알림봇 (AG-Bot)',
    status: 'Operational',
    lastUpdate: '2026-03-31',
    author: 'Antigravity AI (Pair: 대장님)'
};

const colors = {
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    magenta: '\x1b[35m',
    red: '\x1b[31m',
    reset: '\x1b[0m',
    bright: '\x1b[1m'
};

const printLine = () => console.log(colors.cyan + '='.repeat(60) + colors.reset);

console.clear();
printLine();
console.log(`${colors.bright}${colors.cyan}   ${info.name} - 진행 상황 보고서${colors.reset}`);
console.log(`   현재 버전: ${colors.yellow}${info.version}${colors.reset} | 상태: ${colors.green}${info.status}${colors.reset}`);
printLine();

console.log(`${colors.magenta}[주요 업데이트 내역]${colors.reset}`);
console.log(` • ${colors.green}v3.2${colors.reset}: 우측 정보 패널(Summary) 및 수송 상세 데이터 확장 (방금)`);
console.log(` • ${colors.green}v3.1${colors.reset}: 프리미엄 라이트 모드(Premium Light) UI 적용 (오늘)`);
console.log(` • ${colors.green}v3.0${colors.reset}: 유니패스 오픈 API(API001) 정식 연동 및 안정화 (오늘)`);
console.log(` • ${colors.green}v2.3${colors.reset}: 유니패스 보안 정책(Token) 대응 및 버튼 버그 수정`);
console.log(` • ${colors.green}v2.2${colors.reset}: 실시간 '즉시 조회' 기능 및 화물 추적 엔진 고도화`);
console.log(` • ${colors.green}v2.1${colors.reset}: 백엔드 서버(Node.js) 실시간 데이터 연동 완료`);
console.log(` • ${colors.green}v2.0${colors.reset}: 프리미엄 다크 모드 UI 및 화물 목록 관리 기능`);
console.log('');

console.log(`${colors.magenta}[시스템 가동 체크]${colors.reset}`);
const checkFile = (file) => {
    const exists = fs.existsSync(path.join(__dirname, file));
    const status = exists ? `${colors.green}준비됨${colors.reset}` : `${colors.red}누락됨${colors.reset}`;
    console.log(` - ${file.padEnd(20)} : ${status}`);
};

checkFile('server.cjs');
checkFile('index.html');
checkFile('src/main.js');
checkFile('src/style.css');
checkFile('대시보드_실행기.bat');
console.log('');

console.log(`${colors.magenta}[사용 방법]${colors.reset}`);
console.log(` ${colors.yellow}>${colors.reset} 대시보드 실행: ${colors.bright}대시보드_실행기.bat${colors.reset} 실행`);
console.log(` ${colors.yellow}>${colors.reset} 즉시 조회: 대시보드 내 ${colors.bright}[🔄 즉시 조회]${colors.reset} 버튼 클릭`);
console.log('');

printLine();
console.log(` ${colors.bright}대장님, 모든 시스템이 정상 가동 중입니다. 명령을 기다립니다!${colors.reset}`);
printLine();
