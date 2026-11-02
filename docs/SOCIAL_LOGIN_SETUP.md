# Android 카카오·Google 로그인 연결 상태

## 현재 상태 — 2026-11-02

이 절이 아래 11월 1일 작업 이력보다 우선한다. 상세 기준은 AOS_DEPLOYMENT_STATUS.md를 따른다.

- 정식 패키지 com.honsulbar.app, 앱 복귀 com.honsulbar.app://auth/callback.
- 공통 Supabase Google/Kakao 공급자와 OAuth 콘솔 설정 완료. HTTPS 공통 API에서 Android 인증·계정 연결·Auth 정리 활성화 확인. 아래 ‘운영 미적용’, ‘기본 APK는 모의’, ‘기기/연락처 인증 미완료’ 등 과거 기록을 현재 작업으로 되돌리지 않는다.
- 양쪽 로그인을 확인한 5분 일회용 연결 코드로 같은 회원·잔액·성인 확인 상태를 유지한다. 기존에 따로 가입한 회원을 자동 병합하지 않는다.
- 계정 변경 중 이전 요청 응답·로그아웃·로그인/연결 OAuth 결과가 새 세션에 적용되지 않게 차단했다. 자동 검사와 실기기 왕복은 구분한다.
- 회원 탈퇴 후 다른 혼술바 회원 소유 관계가 없으면 Supabase Auth 정리 큐로 삭제·재시도한다. Google/Kakao 자체 동의 철회는 자동 완료가 아니며 삭제 안내에 각 공급자 설정 경로를 제공한다.
- Google 프로그램 자동 철회에는 유효한 공급자 access/refresh 토큰, Kakao 연결 해제에는 사용자 토큰 또는 앱 어드민 키가 필요하다. 현재 공급자 토큰은 장기 저장하지 않는다. 자동 철회를 구현·검증 완료로 표시하지 않는다.
- 실제 로그인·취소·프로세스 종료 복구·양방향 연결·공급자 철회·탈퇴 왕복은 통합 실기기 QA에 남아 있다. 신규 AOS 운영 성인 확인 무료 경로도 미해결이다.

## 과거 작업 이력

2026-11-01: 코드·DB 변경안 작성, 실제 공급자 로그인 시험 전.

## 구현됨

- 시스템 브라우저에서 Supabase Auth OAuth 로그인 → PKCE 코드 교환 → 앱 복귀.
- 서버가 설정된 Supabase `/auth/v1/user`로 토큰을 검증하고 공급자 ID를 서버 HMAC으로 식별.
- 이메일 자동 병합 없음. Google/Kakao 계정은 각각 독립 회원으로 시작.
- 최초 가입 플랫폼/공급자, 최근 로그인 플랫폼/시각 기록. 기존 Toss 회원 필드 유지.
- 소셜 로그인 신규 회원은 adult=false. 성인 검증 전 유료 입장/음성 이용 불가.
- 공급자 식별자는 회원 삭제 시 연결 테이블에서 삭제. 가입 보너스 중복 방지 키와 기존 제재 정책은 유지.

## 실제 활성화에 필요한 콘솔 설정

1. 기존 공통 Supabase 프로젝트의 Auth에서 Google/Kakao provider 설정. 무료 플랜 유지, 결제 플랜 변경 없음.
2. Google OAuth 웹 클라이언트/카카오 REST 앱 등록. 공급자 callback에는 Supabase가 표시하는 `https://<project>/auth/v1/callback` 등록.
3. Supabase redirect allowlist에 `com.honsulbar.localtest://auth/callback` 등록. 최종 앱 ID 변경 시 함께 변경.
4. 공급자별 client secret은 Supabase 콘솔에만 저장. Android APK에 넣지 않음.
5. 공통 API 서버에 `HB_ANDROID_AUTH_ENABLED=1` 활성화(기본 비활성). Android 앱 origin은 `https://localhost`로 제한. 공통 API 서버 `HB_IDENTITY_HASH_KEY`(독립 서버 비밀키)·Supabase URL/public key 설정. 동일 키를 임의 변경하면 회원 식별이 바뀌므로 키 관리 필요.
6. 검증된 공통 DB에 `20261101_multi_platform_identity.sql`을 1회 적용. 운영 적용 전 백업 및 로컬 검증 결과 확인. 현재 운영 미적용.
7. AOS 빌드 시 `HB_SOCIAL_LOGIN_ENABLED=1`, `HB_AUTH_PUBLIC_URL`, `HB_AUTH_PUBLIC_KEY` 공개 설정 전달.

현재 기본 APK는 로컬 모의 로그인 유지. 외부 fetch를 차단한 무료 로컬 API에서는 실제 OAuth 서버 검증을 수행하지 못한다. 공급자 로그인 시험에는 비운영 Auth/API 환경을 따로 연결해야 한다. 운영 키를 로컬 시험 서버에 복사하거나 외부 호출 차단을 자동 해제하지 않는다.

## 아직 미완료

- 공급자 콘솔의 실제 설정 및 두 공급자의 실제 로그인 성공 시험.
- 실제 공급자 로그인으로 계정 연결 흐름 시험. 서버 API/DB 및 기존 설정 화면 연결 버튼은 추가 완료. 기존 계정 세션 발급 후 10분 이내만 연결 가능하고 다른 회원에게 연결된 ID의 이전·병합은 거절한다.
- 성인 확인 업체/검증 결과 연동. 소셜 로그인 성공과 성인 확인을 구분한다.
- 실제 공급자 연결 해제/탈퇴 때 Auth 계정 정리 및 토큰 취소. 공개 활성화 전 구현 필요.
- 링크 복귀 취소·프로세스 종료·네트워크 실패의 실기기 시험.

공식 문서: https://supabase.com/docs/guides/auth/social-login/auth-google / https://supabase.com/docs/guides/auth/social-login/auth-kakao / https://supabase.com/docs/guides/auth/sessions/pkce-flow

## 후속 진행

2026-11-01 계정 연결 SQL/API/UI 추가. 연결 후 동일 회원번호·잔액·성인 확인 상태 유지, 추가 가입 보너스 없음. 전체 AOS 자동 테스트 87/87 통과 및 APK 빌드 성공. 실제 공급자 로그인과 모바일 레이아웃은 아직 미검증.

카카오 개발자 가입 및 앱 생성 완료: 앱 `혼술바`, 앱 ID `1632702`, 회사명 `pretotyper`, 카테고리 소셜 네트워킹. 대표 도메인은 선택 항목으로 비워둠. 연락처 등록 없이 앱 생성까지 가능함을 확인했다.

사용자 승인 후 카카오 로그인 ON 완료. REST API 키의 카카오 로그인 리다이렉트 URI 저장 완료. 클라이언트 시크릿은 기본 ON 상태 유지. Supabase 공급자 설정은 아직 미완료. 연결 대상은 기존 혼술바 프로젝트 `kwiwpgyzrioygrekpoeg`, 공급자 리다이렉트는 `https://kwiwpgyzrioygrekpoeg.supabase.co/auth/v1/callback`. 실제 콘솔 표시값과 대조 후 등록한다. 사용자 앱 복귀 주소와 혼동하지 않는다.

브라우저 제어는 복구됐으나 기존 Supabase Chrome 프로필 연결이 현재 보이지 않는다. 현재 Chrome에서 GitHub 로그인을 시도했으나 Supabase가 pretotyper-sth 세션으로 열려 대상 프로젝트 접근 거부를 확인했다. 소유 계정 g-s-s-g-1-0-0으로 Supabase 전환이 필요하다. 운영 활성화·DB 적용은 아직 하지 않았다.

2026-11-01 후속 확인: 사용자가 시크릿 저장 후, Supabase Kakao enabled=ON, 공개 REST 키, Allow users without an email=ON을 저장하고 재진입하여 확인했다. Android 복귀 주소 com.honsulbar.localtest://auth/callback 추가 완료(기존 3개 주소 유지). 공급자 자격증명의 실제 유효성과 로그인 성공은 아직 미검증.

### 실제 인증 요청 결과

KOE205 실패 재현. 카카오 오류 상세가 account_email/profile_image/profile_nickname 미설정을 명시한다. Allow users without an email은 누락 이메일 수용 설정이며 기본 scope 제거 설정이 아니다. Supabase 기본 이메일 scope 구현 확인: https://github.com/supabase/auth/blob/master/internal/api/provider/kakao.go . 콘솔 활성화를 실제 로그인 완료로 보고하지 않는다. 카카오 재로그인 및 Google 최초 약관 승인 대기.

후속 계정 확인: 카카오 재로그인 완료. 비즈 앱 전환 전 앱 아이콘 필수이며, 사업자 없는 개인 개발자는 본인인증과 카카오비즈니스 약관 동의가 필요하다는 콘솔 안내 확인. 기존 공개 로고 업로드 승인 대기. Google Cloud 운영용 계정 최초 약관 동의 완료. 무료 인증용 프로젝트 생성은 자동 승인 검토에서 상업적 목적 표시와 무료 범위 불일치 우려로 차단됨. 명시적인 무결제 프로젝트 생성 승인을 요청했으며 우회하거나 프로젝트 생성을 완료하지 않음.

사용자 명시적 승인 후 Google 프로젝트 Honsulbar Android 생성 완료(ID noted-processor-513409-r5, 운영 계정 pretotyper.sth@gmail.com). OAuth 앱명 혼술바, 지원/연락 이메일 설정 및 외부 테스트 모드 준비. 별도 Google API 사용자 데이터 정책 동의 승인 대기, OAuth 구성 생성 및 클라이언트 발급은 미완료. 카카오 아이콘 업로드는 확장 파일 접근 권한 오류로 미완료이며 원본 PNG 343229바이트로 250KB 제한도 초과한다. 결제 계정·카드·유료 리소스 등록 없음.

후속 완료: 카카오 기존 로고를 128x128 PNG 약 20KB로 조정하여 기본 macOS 파일 선택창으로 업로드·저장했고 실제 아이콘 반영 확인. 확장 권한 변경 불필요. Google OAuth 구성 생성 완료. 웹 클라이언트 Honsulbar Supabase Auth와 Supabase 콜백 입력 완료, 새 인증정보 생성 직전 사용자 직접 작업 대기. 카카오 개인 개발자 계정은 본인인증 미완료로 확인됨; 계정 설정의 본인인증하기 화면 준비.

사용자 조건부 승인(추가 과금 없음) 후 카카오 개인 개발자 비즈 앱 전환 저장 및 완료 문구 확인. 전환 화면에 결제·카드 입력이나 추가 약관 없음. 로그인 동의항목과 실제 인증은 계속 미완료. Google 공급자는 사용자 승인 후 ON 저장·재진입 확인 완료.
