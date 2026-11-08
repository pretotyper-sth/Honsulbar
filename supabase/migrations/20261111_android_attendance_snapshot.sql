begin;
do $$ declare f record; source text; changes integer:=0; begin
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname like 'hb_snapshot%' loop
  source:=pg_get_functiondef(f.oid);
  if position('label=''광고 출석 포인트''' in source)>0 then
   source:=replace(source,'label=''광고 출석 포인트''','label in (''광고 출석 포인트'',''테스트 광고 출석'')');
   execute source;
   changes:=changes+1;
  end if;
 end loop;
 if changes=0 and not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname like 'hb_snapshot%' and position('테스트 광고 출석' in pg_get_functiondef(oid))>0) then raise exception 'Attendance snapshot definition not found'; end if;
end $$;
commit;
