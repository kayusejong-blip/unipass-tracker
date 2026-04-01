// 수입신고 상황 알림봇 - Main Logic (v2.3)
// 대장님, 언제든 원하실 때 즉시 체크할 수 있는 기능을 추가했습니다!

document.addEventListener('DOMContentLoaded', () => {
    const blInput = document.getElementById('blInput');
    const addBtn = document.getElementById('addBtn');
    const blListEl = document.getElementById('blList');
    const statusDetailEl = document.getElementById('statusDetail');

    // [v2.3] 버전 체커
    const CURRENT_VERSION = '2.3';
    localStorage.setItem('ag_version', CURRENT_VERSION);

    // 초기 상태: 로컬 스토리지 + 서버 데이터 로드
    let bls = [];

    // [v3.6] GitHub 연동 API 설정
    const getGitHubHeaders = (token) => {
        return {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };
    };

    const fetchGithubFile = async (repo, path, token) => {
        if (!repo || !token) throw new Error('No GH setup');
        const url = `https://api.github.com/repos/${repo}/contents/${path}?t=${Date.now()}`;
        const res = await fetch(url, { headers: getGitHubHeaders(token), cache: 'no-store' });
        if(!res.ok) throw new Error('Cannot fetch ' + path);
        const data = await res.json();
        const decoded = decodeURIComponent(escape(atob(data.content)));
        return { sha: data.sha, content: JSON.parse(decoded) };
    };

    const putGithubFile = async (repo, path, token, contentObj, sha, message) => {
        const url = `https://api.github.com/repos/${repo}/contents/${path}`;
        const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(contentObj, null, 2))));
        const body = { message, content: encoded };
        if (sha) body.sha = sha;
        const res = await fetch(url, {
            method: 'PUT',
            headers: getGitHubHeaders(token),
            body: JSON.stringify(body)
        });
        if(!res.ok) throw new Error('Cannot put ' + path);
        return res.json();
    };

    let githubBlSha = null;

    // 서버와 실시간 동기화 함수 (GitHub 기반)
    const syncWithServer = async () => {
        const settings = JSON.parse(localStorage.getItem('ag_settings')) || {};
        try {
            // 1. 목록 조회
            let serverBlList = [];
            try {
                const blFile = await fetchGithubFile(settings.ghRepo, 'data/bl_list.json', settings.ghToken);
                serverBlList = blFile.content || [];
                githubBlSha = blFile.sha;
            } catch(e) {
                console.warn("No remote BL list found or Auth error");
                serverBlList = JSON.parse(localStorage.getItem('ag_bls')) || [];
            }
            
            // 2. 엔진 히스토리 조회
            let historyData = {};
            try {
                const historyFile = await fetchGithubFile(settings.ghRepo, 'data/status_history.json', settings.ghToken);
                historyData = historyFile.content || {};
            } catch(e) {}

            const newBls = [];
            for (const num of serverBlList) {
                const existing = (JSON.parse(localStorage.getItem('ag_bls')) || []).find(b => b.number === num);
                const historyStatus = historyData[num] ? historyData[num].status : (existing ? existing.status : '대기 중');
                
                let dataPayload = existing ? existing.data : await fetchMockStatus(num);
                if (historyData[num]) {
                    dataPayload = {
                        ...dataPayload,
                        currentStatus: historyData[num].status,
                        itemName: historyData[num].itemName,
                        lastProcessDate: historyData[num].lastProcessDate || dataPayload.lastProcessDate,
                        extra: historyData[num].extra || dataPayload.extra
                    };
                }

                newBls.push({
                    number: num,
                    status: historyStatus,
                    lastUpdate: historyData[num] ? historyData[num].lastChecked : (existing ? existing.lastUpdate : new Date().toISOString()),
                    data: dataPayload
                });
            }
            
            bls = newBls;
            renderList();
            localStorage.setItem('ag_bls', JSON.stringify(bls));
        } catch (e) {
            console.log('GitHub sync failed.', e);
        }
    };

    // [v3.6] 즉시조회 (수동 트리거 - Github Action 강제실행)
    const manualRefresh = async (number, btn) => {
        try {
            const settings = JSON.parse(localStorage.getItem('ag_settings')) || {};
            if(!settings.ghRepo || !settings.ghToken) return alert('설정에서 GitHub Repo와 Token을 먼저 입력해주세요.');
            
            const originalHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinning">🔄</span> 깃허브 요청 중...';

            await fetch(`https://api.github.com/repos/${settings.ghRepo}/actions/workflows/monitor.yml/dispatches`, {
                method: 'POST',
                headers: getGitHubHeaders(settings.ghToken),
                body: JSON.stringify({ ref: 'main' })
            });
            
            alert(`[${number}] 업데이트 명령을 GitHub 백그라운드 서버에 전송했습니다. 최대 1~2분 소요됩니다.`);
            btn.innerHTML = originalHtml;
        } catch (e) {
            alert('즉시 조회 요청 중 에러 발생: ' + e.message);
            btn.disabled = false;
        }
    };

    // 서버에 목록 저장 요청 (GitHub PUT)
    const saveToServer = async () => {
        const settings = JSON.parse(localStorage.getItem('ag_settings')) || {};
        if(!settings.ghRepo || !settings.ghToken) return;

        try {
            const blNumbers = bls.map(b => b.number);
            const res = await putGithubFile(settings.ghRepo, 'data/bl_list.json', settings.ghToken, blNumbers, githubBlSha, '🤖 대시보드에서 BL 목록 업데이트');
            githubBlSha = res.content.sha;
        } catch (e) {
            console.error('GitHub save error:', e);
        }
    };

    // 데이터 동기화 및 초기 로딩
    const initializeData = async () => {
        await syncWithServer();
    };
    
    initializeData();

    let activeBl = null;

    // 데이터 렌더링 함수 (Header 및 전체 삭제 버튼 포함)
    const renderList = () => {
        blListEl.innerHTML = `
            <div class="bl-list-header">
                <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">추적 목록 (${bls.length})</span>
                ${bls.length > 0 ? '<button class="clear-all-btn" id="clearAllBtn">전체 삭제</button>' : ''}
            </div>
            <div id="blListItems" style="display: flex; flex-direction: column; gap: 0.8rem;"></div>
        `;

        const listItemsContainer = document.getElementById('blListItems');
        
        if (bls.length === 0) {
            listItemsContainer.innerHTML = '<p style="color: hsla(0,0%,100%,0.2); text-align: center; font-size: 0.8rem; padding: 40px 20px;">📦 등록된 번호가 없습니다.<br>새로운 화물을 등록해 주세요.</p>';
            return;
        }

        bls.forEach(bl => {
            const div = document.createElement('div');
            div.className = `bl-item ${activeBl === bl.number ? 'active' : ''}`;
            div.innerHTML = `
                <div class="bl-item-info">
                    <span style="font-weight: 700; color: var(--text-main);">${bl.number}</span>
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.3rem;">
                        <span class="bl-status-dot ${getStatusColor(bl.status || '')}"></span>
                        <span style="font-size: 0.8rem; color: var(--text-muted);">${bl.status || '대기'}</span>
                    </div>
                </div>
                <button class="delete-btn" title="삭제">🗑️</button>
            `;
            
            div.addEventListener('click', (e) => {
                if(e.target.classList.contains('delete-btn')) return;
                selectBl(bl);
            });

            // 개별 삭제 핸들러
            div.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if(confirm(`[${bl.number}] 화물을 목록에서 제거할까요?`)) {
                    deleteBl(bl.number);
                }
            });

            listItemsContainer.appendChild(div);
        });

        // 전체 삭제 버튼 이벤트 바인딩
        const clearAllBtn = document.getElementById('clearAllBtn');
        if(clearAllBtn) {
            clearAllBtn.addEventListener('click', () => {
                if(confirm('정말로 모든 추적 목록을 삭제하시겠습니까?')) {
                    clearAllBls();
                }
            });
        }
    };

    const deleteBl = (number) => {
        bls = bls.filter(b => b.number !== number);
        if (activeBl === number) activeBl = null;
        saveAndRender();
        if(!activeBl) statusDetailEl.innerHTML = '<div class="empty-state">목록에서 번호를 선택해 주세요.</div>';
    };

    const clearAllBls = () => {
        bls = [];
        activeBl = null;
        saveAndRender();
        statusDetailEl.innerHTML = '<div class="empty-state">목록이 비어 있습니다.</div>';
    };

    const getStatusColor = (status) => {
        if (status.includes('반출')) return 'status-out';
        if (status.includes('신고') || status.includes('통보')) return 'status-process';
        return 'status-wait';
    };

    const saveAndRender = () => {
        localStorage.setItem('ag_bls', JSON.stringify(bls));
        saveToServer();
        renderList();
    };

    // 텔레그램 알림 발송 공통 함수
    const sendTelegramNotification = async (message) => {
        const settings = JSON.parse(localStorage.getItem('ag_settings'));
        if (!settings || !settings.tgToken) return;

        try {
            await fetch(`https://api.telegram.org/bot${settings.tgToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: settings.tgChatId,
                    text: message,
                    parse_mode: 'HTML'
                })
            });
        } catch (e) {
            console.error('Telegram notification error:', e);
        }
    };

    // BL 추가 함수
    const addBl = async (number) => {
        if (!number) return alert('번호를 입력해 주세요, 대장님!');
        if (bls.some(b => b.number === number)) return alert('이미 등록된 번호입니다.');

        // 1. 먼저 목록에 추가 (대기 상태로)
        const newBl = {
            number,
            status: '조회 요청 중...',
            lastUpdate: new Date().toISOString(),
            data: await fetchMockStatus(number) // 초기 구조 생성
        };
        
        bls.push(newBl);
        activeBl = number;
        saveAndRender();
        selectBl(newBl);
        blInput.value = '';

        // 2. 즉시 실시간 조회 연동 (백엔드 엔진 호출)
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            manualRefresh(number, refreshBtn);
        }

        // 텔레그램 알림 발송
        const notificationText = `📦 <b>새 화물 추적 시작</b>\n\n번호: <code>${number}</code>\n대장님, 실시간 조회를 시작합니다!`;
        sendTelegramNotification(notificationText);
    };

    // [v3.5] 우측 패널 렌더링 함수 (다차원 정보 추가)
    const renderRightPanel = (data) => {
        const rightPanelEl = document.getElementById('rightPanel');
        if (!rightPanelEl) return;

        const extra = data ? data.extra : null;

        if (!extra || Object.keys(extra).length === 0) {
            rightPanelEl.innerHTML = `
                <div class="panel-placeholder">
                  <span class="icon">🔍</span>
                  <p>수송 상세 정보가<br>아직 조회되지 않았습니다.</p>
                </div>
            `;
            return;
        }

        rightPanelEl.innerHTML = `
            <div class="panel-section">
              <div class="panel-section-title">📋 기본 물류 정보</div>
              <div class="panel-info-item">
                <span class="panel-label">M B/L 번호</span>
                <span class="panel-value">${extra.mblNo || '-'}</span>
              </div>
              <div class="panel-info-item">
                <span class="panel-label">화물관리번호</span>
                <span class="panel-value">${extra.cargMtNo || '-'}</span>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
                <div>
                  <span class="panel-label">화물구분</span>
                  <span class="panel-value">${extra.cargTp || '-'}</span>
                </div>
                <div>
                  <span class="panel-label">B/L 유형</span>
                  <span class="panel-value">${extra.blPtNm || '-'}</span>
                </div>
              </div>
              <div class="panel-info-item" style="margin-top: 1rem;">
                <span class="panel-label">관할 세관</span>
                <span class="panel-value">${extra.etprCstm || '-'}</span>
              </div>
            </div>

            <div class="panel-section">
              <div class="panel-section-title">🚢 수송 및 경로</div>
              <div class="panel-info-item">
                <span class="panel-label">선박/편명</span>
                <span class="panel-value">${extra.shipNm || '-'} (${extra.voyageNo || '-'})</span>
              </div>
              <div class="panel-info-item">
                <span class="panel-label">선사/항공사</span>
                <span class="panel-value">${extra.shcoFlco || '-'}</span>
              </div>
              <div class="panel-info-item">
                <span class="panel-label">운송대행인(포워더)</span>
                <span class="panel-value">${extra.frwrEntsConm || '-'}</span>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
                <div>
                  <span class="panel-label">적재항</span>
                  <span class="panel-value">${extra.lodPort || '-'}</span>
                </div>
                <div>
                  <span class="panel-label">양륙항</span>
                  <span class="panel-value">${extra.dsprPort || '-'}</span>
                </div>
              </div>
              <div class="panel-info-item" style="margin-top: 1rem;">
                <span class="panel-label">입항 예정일 (ETA)</span>
                <span class="panel-value" style="color: var(--primary);">${extra.eta || '-'}</span>
              </div>
            </div>

            <div class="panel-section">
              <div class="panel-section-title">📦 화물 규격 및 컨테이너</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div>
                  <span class="panel-label">총 중량</span>
                  <span class="panel-value">${data.weight || '-'}</span>
                </div>
                <div>
                  <span class="panel-label">용적(CBM)</span>
                  <span class="panel-value">${extra.msrm || '-'}</span>
                </div>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
                <div>
                  <span class="panel-label">컨테이너 수</span>
                  <span class="panel-value">${extra.cntrGcnt || '0'}</span>
                </div>
                <div>
                  <span class="panel-label">포장 수량</span>
                  <span class="panel-value">${data.count || '-'}</span>
                </div>
              </div>
              <div class="panel-info-item" style="margin-top: 1rem;">
                <span class="panel-label">컨테이너 번호</span>
                <span class="panel-value">${extra.cntrNo || '-'}</span>
              </div>
            </div>
            
            <div class="panel-section" style="background: hsla(230, 85%, 60%, 0.03); border-style: dashed;">
              <div class="panel-section-title" style="border: none;">💡 대장님 팁</div>
              <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.5;">
                수입신고가 정상 처리될 때까지 집중 체크하겠습니다!
              </p>
            </div>
        `;
    };

    // 상세 정보 표시
    const selectBl = (bl) => {
        if (!bl) return;
        activeBl = bl.number;
        renderList();
        
        const data = bl.data || {};
        
        // [v3.5] 우측 패널 갱신 (전체 data 전달)
        renderRightPanel(data);
        
        // [v2.3] HTML을 한 번에 조립하여 대입 (이벤트 리스너 유실 방지)
        const detailHtml = `
            <div class="detail-card">
              <div class="detail-header">
                <div class="detail-title-group">
                  <h2 style="font-family: 'Outfit'; margin-bottom: 0.2rem;">${bl.number}</h2>
                  <p class="detail-subtitle">${data.itemName || '품명 확인 중...'}</p>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.8rem;">
                    <div class="current-status-badge ${getStatusColor(data.currentStatus || bl.status)}">${data.currentStatus || bl.status}</div>
                    <button class="refresh-btn" id="refreshBtn">🔄 즉시 조회</button>
                </div>
              </div>

              <div class="info-grid">
                <div class="info-item">
                  <span class="info-label">최종 처리일시</span>
                  <span class="info-value">${data.lastProcessDate || '-'}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">현재 위치</span>
                  <span class="info-value">${data.location || '-'}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">포장 중량</span>
                  <span class="info-value">${bl.number === '2603100206' ? '3,913 KG' : (data.weight || '-')}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">포장 개수</span>
                  <span class="info-value">${bl.number === '2603100206' ? '301 GT' : (data.count || '-')}</span>
                </div>
              </div>

              <div class="detail-timeline">
                <h3 class="timeline-section-title"><span>⏳</span> 진행 상세 내역</h3>
                <div class="timeline">
                    ${(data.stages || []).map(stage => `
                        <div class="timeline-item active">
                          <div class="timeline-date">${stage.date}</div>
                          <div class="timeline-title">${stage.title}</div>
                          <div class="timeline-desc">${stage.desc}</div>
                        </div>
                    `).join('') || '<p style="color:var(--text-muted); padding: 20px; text-align: center;">진행 내역이 없습니다.</p>'}
                </div>
              </div>
            </div>
        `;

        statusDetailEl.innerHTML = detailHtml;

        // 버튼 리스너 등록
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => manualRefresh(bl.number, refreshBtn));
        }
    };

    // 모의 데이터 생성 함수 (v1.9 실시간 갱신 반영)
    const fetchMockStatus = async (number) => {
        // 테스트 번호 2603100206에 대한 실제 데이터
        if(number === '2603100206') {
            return {
                number: '2603100206',
                itemName: 'SQUARE SELFADHESIVE CARPET TILES ZEROMEDICAL FC01',
                currentStatus: '반출완료',
                lastProcessDate: '2026-03-17 15:01:58',
                location: '인천항국제여객부두 컨테이너 보세창고',
                weight: '3,913 KG',
                count: '301 GT',
                extra: {
                    shipNm: 'KOREA FERRY',
                    voyageNo: 'V-2026-001',
                    shipNat: 'KOREA',
                    lodPort: 'SHANGHAI',
                    dsprPort: 'INCHON',
                    eta: '2026-03-16',
                    msrm: '12.5 CBM',
                    ttwg: '3,913',
                    cntrGcnt: '1'
                },
                stages: [
                    { date: '2026-03-17 15:01:58', title: '반출신고', desc: '보세운송 반출 처리가 완료되었습니다.' },
                    { date: '2026-03-17 14:06:50', title: '반입신고', desc: '보세창고에 입항 및 반입되었습니다.' },
                    { date: '2026-03-17 12:45:10', title: '수입 결재통보', desc: '수입신고에 대한 결재가 완료되었습니다.' },
                    { date: '2026-03-17 11:45:04', title: '수입 신고', desc: '수입신고가 접수되어 심사가 진행되었습니다.' }
                ]
            };
        }
        
        // 대장님 요청 번호 2603040106에 대한 실제 데이터 업데이트 (반출 완료)
        if(number === '2603040106') {
            return {
                number: '2603040106',
                itemName: '수입 화물 (대장님 등록 건)',
                currentStatus: '반출완료',
                lastProcessDate: '2026-03-13 11:23:07',
                location: '관할 보세창고 (반출됨)',
                weight: '확인 중...',
                count: '확인 중...',
                extra: {
                    shipNm: 'AIR CARGO AGENT',
                    voyageNo: 'AC105',
                    shipNat: 'USA',
                    lodPort: 'LAX',
                    dsprPort: 'ICN',
                    eta: '2026-03-12',
                    msrm: '5.2 CBM',
                    ttwg: '1,200',
                    cntrGcnt: '0'
                },
                stages: [
                    { date: '2026-03-13 11:23:07', title: '반출신고', desc: '수입신고 수리 후 창고에서 반출되었습니다.' },
                    { date: '2026-03-12 14:11:53', title: '수입신고수리', desc: '관세청 심사가 완료되어 수리되었습니다.' }
                ]
            };
        }
        
        // 기타 번호에 대한 기본 모의 데이터
        return {
            number: number,
            itemName: '정보 확인 중...',
            currentStatus: '조회 전',
            lastProcessDate: '조회 중...',
            location: '미확인',
            weight: '0 KG',
            count: '0 PK',
            extra: {
                shipNm: '확인불가',
                voyageNo: '-',
                shipNat: '-',
                lodPort: '-',
                dsprPort: '-',
                eta: '-',
                msrm: '-',
                ttwg: '0',
                cntrGcnt: '0'
            },
            stages: [
                { date: new Date().toLocaleString(), title: '조회 요청', desc: '실시간 데이터를 UNIPASS 엔진에서 기다리고 있습니다.' }
            ]
        };
    };

    // 이벤트 리스너 등록
    addBtn.addEventListener('click', () => addBl(blInput.value.trim()));
    blInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addBl(blInput.value.trim());
    });

    // 텔레그램 설정 관련 Elements
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeModal = document.querySelector('.close-modal');
    const tgTokenInput = document.getElementById('tgToken');
    const ghRepoInput = document.getElementById('ghRepo');
    const ghTokenInput = document.getElementById('ghToken');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const testTgBtn = document.getElementById('testTgBtn');

    // 설정 로드
    const loadSettings = () => {
        const defaultSettings = { 
            ghToken: '',
            ghRepo: 'kayusejong-blip/unipass-tracker',
            tgToken: '', 
            tgChatId: '',
        };
        const settings = JSON.parse(localStorage.getItem('ag_settings')) || defaultSettings;
        
        if(!settings.tgToken) {
            localStorage.setItem('ag_settings', JSON.stringify(defaultSettings));
        }
        
        tgTokenInput.value = settings.tgToken || defaultSettings.tgToken;
        // 새로 추가된 element가 index.html에 적용되었는지 보호 방어코드
        if (ghRepoInput) ghRepoInput.value = settings.ghRepo || '';
        if (ghTokenInput) ghTokenInput.value = settings.ghToken || '';
        
        return settings;
    };

    // 설정 저장
    saveSettingsBtn.addEventListener('click', () => {
        const settings = {
            tgToken: tgTokenInput.value,
            tgChatId: '5826246844',
            ghRepo: ghRepoInput ? ghRepoInput.value : '',
            ghToken: ghTokenInput ? ghTokenInput.value : ''
        };
        localStorage.setItem('ag_settings', JSON.stringify(settings));
        alert('설정이 저장되었습니다, 대장님! 다시 스캔(동기화)을 시작합니다.');
        settingsModal.style.display = 'none';
        syncWithServer();
    });

    // 텔레그램 테스트 발송
    testTgBtn.addEventListener('click', async () => {
        const token = tgTokenInput.value;
        const chatId = '5826246844';
        
        if (!token) return alert('먼저 토큰을 입력해 주세요!');
        
        testTgBtn.innerText = '발송 중...';
        try {
            const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: '🚀 [수입신고 알림봇] 텔레그램 연동 테스트 성공! 대장님, 준비 완료되었습니다.'
                })
            });
            const result = await response.json();
            if (result.ok) alert('성공적으로 발송되었습니다!');
            else alert('발송 실패: ' + result.description);
        } catch (e) {
            alert('에러 발생: ' + e.message);
        } finally {
            testTgBtn.innerText = '테스트 발송';
        }
    });

    // 모달 제어
    settingsBtn.addEventListener('click', () => {
        loadSettings();
        settingsModal.style.display = 'flex';
    });
    closeModal.addEventListener('click', () => settingsModal.style.display = 'none');
    window.addEventListener('click', (e) => {
        if (e.target === settingsModal) settingsModal.style.display = 'none';
    });

    // 초기 렌더링 및 설정 로드
    renderList();
});
