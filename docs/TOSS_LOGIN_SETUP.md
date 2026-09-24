# 혼술바 토스 로그인 설정 현황

## 현재 상태

- 앱은 토스 인가 코드를 서버에서 토큰으로 바꾸고, 생년월일을 복호화해 만 19세를 확인한 뒤 세션을 발급합니다. 구현 위치: `src/api.js`, `api/service.js`, `server/platform.js`.
- 연결 끊기 콜백 `api/toss-unlink.js`는 세션 무효화와 회원 삭제를 `apply_toss_login_disconnect`로 처리합니다.
- 콘솔에 이용약관·개인정보처리방침 URL은 등록되어 있습니다. 실제 로그인이 되려면 Vercel에 mTLS 인증서, 복호화 키, AAD, 연결 끊기 Basic Auth가 있어야 합니다.

## 연결 끊기 콜백

- URL: `https://honsulbar-app.vercel.app/api/toss-unlink`
- 메서드: `POST`
- Basic Auth 헤더 입력란: `username:password` 형태의 충분히 긴 임의 값. `Basic ` 접두어 또는 Base64 인코딩값을 입력하지 않습니다.
- Vercel Production 환경변수 `TOSS_UNLINK_BASIC_AUTH`: 콘솔에 입력한 값과 동일하게 Secret으로 설정합니다.
- Vercel Production 환경변수 `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` 또는 `VITE_SUPABASE_URL`.

콜백은 Basic Auth를 확인하고 사용자 키가 `0`인 콘솔 시험 요청은 저장하지 않습니다. `UNLINK`는 연결 상태를 해제하고, `WITHDRAWAL_TERMS`·`WITHDRAWAL_TOSS`는 회원과 링크 기록을 삭제합니다.

## 동의 항목

- 이름: 콘솔 기본 필수 항목 유지. 앱 공개 이름은 닉네임을 사용합니다.
- 생년월일: 만 19세 이상 입장 제한을 서버에서 검증하기 위해 필수 동의.
- 이메일, 성별, 내·외국인 정보, 휴대전화번호, CI: 사용 안 함. 성별은 앱 프로필에서 선택합니다.
- 마케팅 정보 수신 동의: 광고성 알림을 실제 발송하기 전까지 등록하지 않습니다.

## 남은 콘솔 작업

앱인토스 콘솔에서 mTLS 인증서와 복호화 키를 받아 Vercel Secret으로 넣습니다. 생년월일 동의가 필수인지, 연결 끊기 콜백 테스트가 성공하는지를 확인합니다.
