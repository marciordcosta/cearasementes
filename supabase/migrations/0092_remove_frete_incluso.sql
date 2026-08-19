-- "Frete incluso na margem" (checkbox por canal) perde sentido: agora quem decide se o frete
-- entra na margem/preço sugerido é o próprio "Frete cobrado do cliente" (freteAdicionalTipo) —
-- no modo "Total" (transportadora) o frete NUNCA entra na margem (cobrado à parte, valor cheio,
-- só no Catálogo Online); em qualquer outro modo (Fixo, R$/Kg) sempre entrou, como sempre foi.
alter table canais_preco drop column if exists frete_incluso;
