-- Grant execute on all functions to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.create_workspace(TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_meta_token(UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_meta_token(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_api_key(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_api_key(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
