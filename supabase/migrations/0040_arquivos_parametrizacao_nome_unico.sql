-- Trava nome_produto como único: Parametrização de Produtos passou a ser
-- keyed por "grupo" (1ª + 3ª palavra do nome, ver grupoDoNome no app) — um
-- cadastro só por grupo, nunca duplicado. Antes disso só a UI garantia isso
-- (checagem em memória); dois campos editados em sequência rápida (PMS,
-- depois Densidade) sem esperar o primeiro save voltar podiam criar DUAS
-- linhas pro mesmo grupo (nenhuma sabia da outra ainda), e o "excluir" só
-- limpava uma delas, deixando a outra órfã com valor "fantasma". Elimina
-- duplicatas existentes (mantém a mais recente) antes de travar a unicidade
-- no banco, e o app troca `upsert` pra usar `nome_produto` como chave de
-- conflito (não mais `id`) — a constraint garante isso mesmo sob concorrência.

delete from arquivos_parametrizacao_produtos
where id in (
  select id
  from (
    select id, row_number() over (partition by nome_produto order by atualizado_em desc, id desc) as rn
    from arquivos_parametrizacao_produtos
  ) t
  where t.rn > 1
);

alter table arquivos_parametrizacao_produtos
  add constraint arquivos_parametrizacao_produtos_nome_produto_key unique (nome_produto);
