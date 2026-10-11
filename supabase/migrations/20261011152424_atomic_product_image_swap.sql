-- Administrative compare-and-swap: only image fields; no privileged public endpoint.
create or replace function public.compare_and_swap_product_images(
  p_product_id uuid, p_expected jsonb, p_replacement jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  current_row public.products%rowtype;
  expected_row public.products%rowtype;
  replacement_row public.products%rowtype;
  required_keys text[] := array['image','image_storage_path','image_thumb_storage_path',
    'image_content_type','image_file_size','image_updated_at'];
begin
  if p_expected is null or p_replacement is null
    or jsonb_typeof(p_expected) <> 'object' or jsonb_typeof(p_replacement) <> 'object'
    or not (p_expected ?& required_keys) or not (p_replacement ?& required_keys)
    or (p_expected - required_keys) <> '{}'::jsonb
    or (p_replacement - required_keys) <> '{}'::jsonb then
    raise exception 'Exactly all six image fields are required' using errcode = '22023';
  end if;
  expected_row := jsonb_populate_record(null::public.products, p_expected);
  replacement_row := jsonb_populate_record(null::public.products, p_replacement);
  -- Lock persists through comparison and update in this single RPC transaction.
  select * into current_row from public.products where id = p_product_id for update;
  if not found then return jsonb_build_object('status','missing'); end if;
  if row(current_row.image,current_row.image_storage_path,current_row.image_thumb_storage_path,
      current_row.image_content_type,current_row.image_file_size,current_row.image_updated_at)
    is not distinct from row(replacement_row.image,replacement_row.image_storage_path,replacement_row.image_thumb_storage_path,
      replacement_row.image_content_type,replacement_row.image_file_size,replacement_row.image_updated_at) then
    return jsonb_build_object('status','already-applied');
  end if;
  if row(current_row.image,current_row.image_storage_path,current_row.image_thumb_storage_path,
      current_row.image_content_type,current_row.image_file_size,current_row.image_updated_at)
    is distinct from row(expected_row.image,expected_row.image_storage_path,expected_row.image_thumb_storage_path,
      expected_row.image_content_type,expected_row.image_file_size,expected_row.image_updated_at) then
    return jsonb_build_object('status','conflict');
  end if;
  update public.products set
    image = replacement_row.image,
    image_storage_path = replacement_row.image_storage_path,
    image_thumb_storage_path = replacement_row.image_thumb_storage_path,
    image_content_type = replacement_row.image_content_type,
    image_file_size = replacement_row.image_file_size,
    image_updated_at = replacement_row.image_updated_at
  where id = p_product_id;
  return jsonb_build_object('status','changed');
end;
$$;
revoke all on function public.compare_and_swap_product_images(uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.compare_and_swap_product_images(uuid,jsonb,jsonb) to service_role;
