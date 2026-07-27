-- Guarda o texto do aviso (valor diferente, forma de pagamento diferente)
-- mostrado ao usuário no momento em que ele confirmou uma conciliação manual
-- mesmo com a diferença sinalizada — permite mostrar o "!" informativo nos
-- lançamentos já conciliados, sem precisar recalcular nada depois (o cálculo
-- é feito uma vez, no momento da conciliação, e fica congelado aqui).
alter table conciliacao_grupos add column if not exists aviso_diferenca text;
