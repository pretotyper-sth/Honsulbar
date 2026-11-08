import React, { useState } from 'react';
import { Button, BottomSheet } from './ui';
import { AgreementV4, Top, BottomCTA, TextButton } from '@toss/tds-mobile';
import { TDSMobileAITProvider } from '@toss/tds-mobile-ait';

const documents = [
  ['이용약관', '/legal/terms.html'],
  ['개인정보처리방침', '/legal/privacy.html'],
  ['커뮤니티 가이드라인', '/legal/community.html'],
];

export function SignupConsent({ busy, error, onAgree, onLeave }) {
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [document, setDocument] = useState(null);
  return <TDSMobileAITProvider><main className="app signup-screen signup-tds">
    <div className="signup-consent">
      <Top upperGap={24} title={<Top.TitleParagraph>혼술바를 시작하기 전에<br/>동의해 주세요</Top.TitleParagraph>}/>
      <div className="signup-consent-options">
        {[[terms,setTerms,documents[0]],[privacy,setPrivacy,documents[1]]].map(([checked,setChecked,doc])=><AgreementV4
          key={doc[0]} variant="large"
          left={<AgreementV4.Checkbox aria-label={doc[0]+' 동의 (필수)'} checked={checked} onCheckedChange={setChecked}/>}
          middle={<AgreementV4.Text onPressEnd={()=>setChecked(!checked)} necessity={<AgreementV4.Necessity variant="mandatory">필수</AgreementV4.Necessity>}>{doc[0]} 동의</AgreementV4.Text>}
          right={<AgreementV4.RightArrow collapsed={true} aria-label={doc[0]+' 보기'} onArrowClick={()=>setDocument(doc)}/>}
        />)}
      </div>
      <footer className="signup-consent-actions">
        {error&&<p className="error" role="alert">{error}</p>}
        <BottomCTA fixed={false} disabled={busy||!terms||!privacy} onClick={onAgree} bottomAccessory={<TextButton size="medium" onClick={onLeave} disabled={busy}>나중에 하기</TextButton>}>동의하고 계속하기</BottomCTA>
      </footer>
    </div>
    <BottomSheet open={!!document} onClose={()=>setDocument(null)} ariaLabelledBy="signup-document-title" className="app-bottom-sheet">
      <div className="sheet sheet-compact">
        <h2 id="signup-document-title">{document?.[0]}</h2>
        {document&&<iframe className="legal-frame" src={document[1]} title={document[0]}/>}
        <Button display="block" onClick={()=>setDocument(null)}>확인</Button>
      </div>
    </BottomSheet>
  </main></TDSMobileAITProvider>;
}
