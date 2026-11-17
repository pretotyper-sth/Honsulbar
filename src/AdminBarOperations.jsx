import React, { useEffect, useState } from 'react';
import { barMusic } from './bar-music';
import { REGIONS } from './model';
import { BAR_THEME_LABELS, MAX_LOBBY_NOTICE, MAX_ROOM_THEMES, validateBarOperations } from './bar-operations';
import './admin-bar-operations.css';

export function AdminBarOperations({ token, request, styles }) {
  const [revision, setRevision] = useState(null);
  const [draft, setDraft] = useState(null);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let canceled = false;
    request(token, 'admin-bar-operations').then(({settings, revision}) => {
      if (canceled) return;
      setDraft(settings);
      setRevision(revision);
      setMessage('');
    }).catch(error => {
      if (!canceled) setMessage(error.message);
    }).finally(() => {
      if (!canceled) setLoading(false);
    });
    return () => { canceled = true; };
  }, [token, request, reload]);

  function update(key, value) {
    setDraft(previous => ({...previous, [key]:value}));
    setMessage('');
  }

  function updateRoom(index, changes) {
    update('roomThemes', draft.roomThemes.map((room, i) => i === index ? {...room,...changes} : room));
  }

  async function save(event) {
    event.preventDefault();
    if (saving || revision === null) return;
    setSaving(true);
    setMessage('');
    try {
      const settings = validateBarOperations(draft);
      const saved = await request(token, 'admin-save-bar-operations', {settings, revision});
      setDraft(saved.settings);
      setRevision(saved.revision);
      setMessage('저장했어요.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  return <section style={styles.card} aria-labelledby="bar-operations-heading">
    <h2 id="bar-operations-heading">앱인토스 운영 설정</h2>
    <p style={styles.meta}>저장한 값은 이 설정을 지원하는 버전에서 다음 입장이나 홈 방문에 적용돼요.</p>
    <form onSubmit={save}>
      {draft && <fieldset className="bar-ops-fields" disabled={loading || saving}>
        <table className="bar-ops-table" aria-label="앱인토스 운영 설정 항목">
          <thead><tr><th scope="col">항목</th><th scope="col">설정</th></tr></thead>
          <tbody>
            <tr><th scope="row">BGM 재생곡<small>등록된 음원을 무작위로 재생해요.</small></th>
              <td><details className="bar-ops-tracks">
                <summary>{draft.tracks.length}곡 선택</summary>
                {barMusic.map(track => <label key={track.file}>
                  <input type="checkbox" checked={draft.tracks.includes(track.file)}
                    onChange={event => update('tracks',event.target.checked ? [...draft.tracks,track.file] : draft.tracks.filter(id => id !== track.file))}/>
                  {track.title}
                </label>)}
              </details></td></tr>
            <tr><th scope="row"><label htmlFor="ops-bgm-volume">BGM 기본 음량</label><small>개인 설정이 없는 손님에게 적용해요.</small></th>
              <td><div className="bar-ops-volume"><input id="ops-bgm-volume" type="number" min={0} max={100} step={1}
                required value={draft.bgmVolume} onChange={event => update('bgmVolume',event.target.value === '' ? '' : event.target.valueAsNumber)}/> %</div></td></tr>
            <tr><th scope="row">호점 테마<small>지정하지 않은 호점은 자동 배정돼요.</small></th>
              <td><div className="bar-ops-rooms">
                {draft.roomThemes.map(({region,number,theme},index) => <div className="bar-ops-room" key={index}>
                  <select aria-label={`지역 ${index+1}`} value={region} onChange={event => updateRoom(index,{region:event.target.value})}>
                    {REGIONS.map(item => <option key={item}>{item}</option>)}
                  </select>
                  <input aria-label={`호점 번호 ${index+1}`} type="number" min={1} max={2147483647} required placeholder="호점"
                    value={number} onChange={event => updateRoom(index,{number:event.target.value === '' ? '' : event.target.valueAsNumber})}/>
                  <select aria-label={`테마 ${index+1}`} value={theme} onChange={event => updateRoom(index,{theme:event.target.value})}>
                    {Object.entries(BAR_THEME_LABELS).map(([id,label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                  <button type="button" style={styles.weak} aria-label={`호점 테마 ${index+1} 삭제`}
                    onClick={() => update('roomThemes',draft.roomThemes.filter((_,i) => i !== index))}>삭제</button>
                </div>)}
                <button type="button" style={styles.weak} disabled={draft.roomThemes.length >= MAX_ROOM_THEMES}
                  onClick={() => update('roomThemes',[...draft.roomThemes,{region:REGIONS[0],number:'',theme:'original'}])}>호점 추가</button>
              </div></td></tr>
            <tr><th scope="row"><label htmlFor="ops-lobby-notice">홈 공지</label><small>비워두면 표시하지 않아요.</small></th>
              <td><textarea id="ops-lobby-notice" rows={2} maxLength={MAX_LOBBY_NOTICE} value={draft.lobbyNotice}
                onChange={event => update('lobbyNotice',event.target.value)}/></td></tr>
          </tbody>
        </table>
      </fieldset>}
      <div className="bar-ops-actions">
        {draft && <button type="submit" style={styles.button} disabled={saving || loading}>{saving ? '저장 중…' : '저장하기'}</button>}
        <button type="button" style={styles.weak} disabled={saving || loading} onClick={() => {setLoading(true);setReload(value=>value+1);}}>다시 불러오기</button>
      </div>
      <p role="status" style={styles.meta}>{loading ? '운영 설정을 불러오는 중이에요.' : message}</p>
    </form>
  </section>;
}
