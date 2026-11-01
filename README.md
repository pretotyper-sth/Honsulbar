# 혼술바 Android (AOS)

앱인토스와 병렬 서비스할 독립 Android 프로젝트다. 앱인토스 소스는 `../Honsulbar`에 있으며, 이 폴더의 빌드·설정·의존성은 별개다. 현재는 비용이 발생하지 않는 로컬 테스트 단계이며 Play 출시용 연동 완료본이 아니다.

## 실행

Node.js 22 이상, JDK 21, Android SDK가 필요하다.

- `npm ci`: AOS 의존성 설치
- `npm run android:server`: 외부 서버 호출을 차단한 로컬 테스트 API/DB
- `npm run android:sync`: 기존 화면의 Android 웹 빌드 및 네이티브 동기화
- `npm run android:apk`: debug APK 빌드
- `npm run android:open`: Android Studio 열기
- `npm test`: 기능 및 안전장치 검증

테스트 앱 ID는 `com.honsulbar.localtest`다. 최종 Play 앱 ID는 추후 확정한다. 테스트 빌드는 토스 브리지를 포함하지 않고, 실제 결제·광고·성인 인증 대신 테스트 경로를 사용한다. release 빌드는 차단되어 있다.

현재 Mac에서는 설치한 도구를 사용하는 `bash scripts/android-local.sh apk`로 빌드하고, 다른 터미널에서 `bash scripts/android-local.sh server`로 API를 실행할 수 있다. Node가 기본 경로에 없으면 기존 Cursor 내장 Node를 사용하며 시스템 설정을 바꾸지 않는다.

## 하나의 운영 DB

운영 목표는 두 앱 → 동일한 서버 API → 동일한 Supabase 프로젝트다. 사용자·호점·좌석·포인트·신고는 공통 원장을 사용한다. 현재 공통 운영 API의 소스와 DB 마이그레이션 원본은 `../Honsulbar`에 유지한다. 이 폴더의 `api/`, `server/`, `supabase/`는 격리된 로컬 시험용 복사본이며, 운영용으로 별도 배포하거나 같은 마이그레이션을 중복 적용하지 않는다.

Google 로그인과 Toss 로그인은 서로 다른 사용자 식별자를 사용한다. 같은 DB라는 이유만으로 동일 인물 계정을 자동 합치지 않는다. 실제 AOS 인증 연동 시 공통 API/회원 식별자 매핑을 확장해야 한다.

테스트 서버는 운영 환경변수를 읽지 않고 별도 `.local-pg-android` DB를 사용한다. 앱인토스 시험 DB와도 공유하지 않는다. `.env.example`의 운영 API 주소는 목표 설정이며, 현재 APK는 의도적으로 PC 로컬 API만 연결한다.

## 남은 준비

[전체 체크리스트](docs/ANDROID_ZERO_COST_CHECKLIST.md), [두 앱 운영 구조](../PROJECTS.md)를 참고한다. 실제 Google 로그인·성인 확인·Play Billing·AdMob·FCM·다중 기기 음성 검증은 아직 필요하다.

## 검증 결과

2026-11-01: 자동 테스트 84/84, 웹 빌드·네이티브 빌드·APK 서명 검증 성공. `android/app/build/outputs/apk/debug/app-debug.apk`를 AOSP Android 15 에뮬레이터에 설치하고 시작 화면 실행을 확인했다. 실제 인증·결제·푸시·기기 간 음성 완료를 의미하지 않는다.
