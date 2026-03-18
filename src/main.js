// 수입신고 상황 알림봇 - Main Logic (v1.0)
// 대장님, 조회된 데이터를 바탕으로 대시보드 로직을 구성했습니다.

document.addEventListener('DOMContentLoaded', () => {
    const blInput = document.getElementById('blInput');
    const addBtn = document.getElementById('addBtn');
    const blListEl = document.getElementById('blList');
    const statusDetailEl = document.getElementById('statusDetail');

    // 초기 상태: 로컬 스토리지에서 데이터 로드
    let bls = JSON.parse(localStorage.getItem('ag_bls')) || [];
    let activeBl = null;

    // 데이터 렌더링 함수
    const renderList = () => {
        blListEl.innerHTML = '';
        bls.forEach(bl => {
            const li = document.createElement('li');
            li.className = `bl-item ${activeBl === bl.number ? 'active' : ''}`;
            li.innerHTML = `
                <span class="bl-name">${bl.number}</span>
                <span class="bl-status-dot ${getStatusColor(bl.status)}"></span>
                <span class="bl-status-text">${bl.status}</span>
                <button class="delete-btn" style="position: absolute; right: 10px; top: 10px; background: none; color: white; opacity: 0.3; padding: 5px;">&times;</button>
            `;
            
            li.addEventListener('click', (e) => {
                if(e.target.classList.contains('delete-btn')) return;
                selectBl(bl);
            });

            // 삭제 버튼 핸들러
            li.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteBl(bl.number);
            });

            blListEl.appendChild(li);
        });

        if (bls.length === 0) {
            blListEl.innerHTML = '<p style="color: hsla(0,0%,100%,0.2); text-align: center; font-size: 0.8rem; padding: 20px;">등록된 번호가 없습니다.</p>';
        }
    };

    const deleteBl = (number) => {
        bls = bls.filter(b => b.number !== number);
        if (activeBl === number) activeBl = null;
        saveAndRender();
        if(!activeBl) statusDetailEl.innerHTML = '<div class="empty-state">목록에서 번호를 선택해 주세요.</div>';
    };

    const getStatusColor = (status) => {
        if (status.includes('반출')) return 'status-out';
        if (status.includes('신고') || status.includes('통보')) return 'status-process';
        return 'status-wait';
    };

    const saveAndRender = () => {
        localStorage.setItem('ag_bls', JSON.stringify(bls));
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

        const mockData = await fetchMockStatus(number);
        
        bls.push({
            number,
            status: mockData.currentStatus,
            lastUpdate: new Date().toISOString(),
            data: mockData
        });

        activeBl = number;
        saveAndRender();
        selectBl(bls.find(b => b.number === number));
        blInput.value = '';

        // 텔레그램 알림 발송
        const notificationText = `📦 <b>새 화물 추가</b>\n\n번호: <code>${number}</code>\n상태: <b>${mockData.currentStatus}</b>\n품명: ${mockData.itemName}\n최종 처리: ${mockData.lastProcessDate}`;
        sendTelegramNotification(notificationText);
    };

    // 상세 정보 표시
    const selectBl = (bl) => {
        activeBl = bl.number;
        renderList();
        
        const data = bl.data;
        statusDetailEl.innerHTML = `
            <div class="detail-card">
              <div class="detail-header">
                <div>
                  <h2 style="font-family: 'Outfit'; margin-bottom: 0.2rem;">${bl.number}</h2>
                  <p style="color: var(--text-muted); font-size: 0.9rem;">${data.itemName}</p>
                </div>
                <div class="current-status-badge ${getStatusColor(data.currentStatus)}">${data.currentStatus}</div>
              </div>

              <div class="info-grid">
                <div class="info-item">
                  <span class="info-label">최종 처리일시</span>
                  <span class="info-value">${data.lastProcessDate}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">현재 위치</span>
                  <span class="info-value">${data.location}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">총 중량</span>
                  <span class="info-value">${data.weight}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">총 수량</span>
                  <span class="info-value">${data.count}</span>
                </div>
              </div>

              <div class="timeline-container">
                <h3 style="margin-bottom: 1.5rem; font-family: 'Outfit';">진행 상태 타임라인</h3>
                <div class="timeline">
                  ${data.stages.map((stage, index) => `
                    <div class="timeline-item ${index === 0 ? 'active' : ''}">
                      <div class="timeline-date">${stage.date}</div>
                      <div class="timeline-title">${stage.title}</div>
                      <div class="timeline-desc">${stage.desc}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
        `;
    };

    // 모의 데이터 생성 함수 (v1.0 테스트용)
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
                stages: [
                    { date: '2026-03-17 15:01:58', title: '반출신고', desc: '보세운송 반출 처리가 완료되었습니다.' },
                    { date: '2026-03-17 14:06:50', title: '반입신고', desc: '보세창고에 입항 및 반입되었습니다.' },
                    { date: '2026-03-17 12:45:10', title: '수입 결재통보', desc: '수입신고에 대한 결재가 완료되었습니다.' },
                    { date: '2026-03-17 11:45:04', title: '수입 신고', desc: '수입신고가 접수되어 심사가 진행되었습니다.' }
                ]
            };
        }
        
        // 기타 번호에 대한 기본 모의 데이터
        return {
            number: number,
            itemName: '모의 수입 물품 정보',
            currentStatus: '진행 중',
            lastProcessDate: '조회 중...',
            location: '미확인',
            weight: '0 KG',
            count: '0 PK',
            stages: [
                { date: '2026-03-18 00:00:00', title: '조회 요청', desc: 'UNIPASS 실시간 데이터를 요청 중입니다.' }
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
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const testTgBtn = document.getElementById('testTgBtn');

    // 설정 로드
    const loadSettings = () => {
        const defaultSettings = { 
            tgToken: '8599634247:AAFxtif1sMu1yqibBBR7Ce1m3Q_SKWKS4i8', 
            tgChatId: '5826246844' 
        };
        const settings = JSON.parse(localStorage.getItem('ag_settings')) || defaultSettings;
        
        // 만약 기존 설정이 비어있다면 기본값으로 채움
        if(!settings.tgToken) {
            localStorage.setItem('ag_settings', JSON.stringify(defaultSettings));
            return defaultSettings.tgToken;
        }
        
        tgTokenInput.value = settings.tgToken;
        return settings.tgToken;
    };

    // 설정 저장
    saveSettingsBtn.addEventListener('click', () => {
        const settings = {
            tgToken: tgTokenInput.value,
            tgChatId: '5826246844'
        };
        localStorage.setItem('ag_settings', JSON.stringify(settings));
        alert('설정이 저장되었습니다, 대장님!');
        settingsModal.style.display = 'none';
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
