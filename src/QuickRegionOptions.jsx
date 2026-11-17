import React from 'react';
import { ListRow } from '@toss/tds-mobile';
import { TDSMobileAITProvider } from '@toss/tds-mobile-ait';
import { Check } from 'lucide-react';
import { REGIONS } from './model.js';

export default function QuickRegionOptions({ region, onSelect }) {
  return <TDSMobileAITProvider>
    <div role="group" aria-label="지역 선택">
      {REGIONS.map(name => <ListRow
        key={name}
        as="button"
        type="button"
        aria-pressed={name === region}
        border="none"
        contents={<ListRow.Texts type="1RowTypeA" top={name}/>}
        right={name === region ? <Check size={20} color="#3182f6" aria-hidden="true"/> : null}
        onClick={() => onSelect(name)}
      />)}
    </div>
  </TDSMobileAITProvider>;
}
