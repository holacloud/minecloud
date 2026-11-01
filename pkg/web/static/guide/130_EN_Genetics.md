# Genetics

![Goats of two colours](mob:goat)

Why do two white goats sometimes have a brown kid? Because every tamed animal carries **genes**, and each baby gets
half of them from its mother and half from its father. This page explains how, with examples you can try with
your own animals. To read an animal's genes you need the [breeding notebook](131).

## Genes and alleles

A **gene** decides one trait: the colour of the coat, for instance. Each animal has **two copies** of every gene,
one from each parent. The versions a gene comes in are its **alleles**: the coat gene of a goat has a white allele
(`W`) and a brown one (`w`).

- **Genotype:** the two alleles it carries, such as `Ww`.
- **Phenotype:** what you see: a white goat.

When the two alleles differ, the **dominant** one shows and the **recessive** one hides. The hidden allele is not
lost: the animal can pass it on to its babies. An animal that hides an allele is a **carrier**.

## The three genes

Every tamed animal ([Taming and breeding](3)) has three genes.

| Gene | Alleles | How they mix |
|---|---|---|
| Coat | one per colour of the species, plus the rare albino `a` | a chain: the stronger one shows |
| Size | `L` and `l` | incomplete dominance: `LL` large (×1.15), `Ll` normal, `ll` small (×0.85) |
| Speed | `N` normal, `f` fast, `s` slow | a chain: `N` > `f` > `s`; fast walks ×1.3, slow ×0.75 |

A fast horse also gallops faster when you ride it ([Riding](7)).

### The coat chains

Each colour beats the ones to its right. The albino `a` loses against all of them.

| Animal | Chain |
|---|---|
| ![](mob:goat) [Goat](32) | `W` white > `w` brown > `a` albino |
| ![](mob:horse) [Horse](34) | `G` grey > `B` bay > `K` black > `c` chestnut > `a` albino |
| ![](mob:cat) [Cat](25) | `T` tabby > `O` ginger > `c` cream > `a` albino |
| ![](mob:macaw) [Macaw](23) | `G` green > `B` blue > `R` red > `y` yellow > `a` albino |
| Sheep, duck, pig, giraffe, dog, camel | its only colour (`W`, `P`, `S` or `T`) > `a` albino |

## Wild animals

When you tame a wild animal it gets genes at random, but always **matching the colour it shows**. A brown goat
can only be `ww`. A white goat can be `WW` or a `Ww` carrier: you cannot tell by looking, but the notebook can.

## Punnett squares

A **Punnett square** predicts the babies of two animals. Write the alleles of one parent along the top and those
of the other down the side; each cell is a baby, and the four cells are equally likely (25 % each).

**Two `Ww` goats** (both white, both carriers of brown):

| | `W` | `w` |
|---|---|---|
| `W` | `WW` white | `Ww` white |
| `w` | `Ww` white | `ww` **brown** |

Three white kids for every brown one: 75 % white, 25 % brown. The brown colour was hiding in both parents!

**A bay horse that carries chestnut (`Bc`) and a chestnut mare (`cc`):**

| | `c` | `c` |
|---|---|---|
| `B` | `Bc` bay | `Bc` bay |
| `c` | `cc` chestnut | `cc` chestnut |

Half bay, half chestnut.

**Size, two normal sheep (`Ll` × `Ll`):** 25 % large (`LL`), 50 % normal (`Ll`) and 25 % small (`ll`). With
incomplete dominance the mixture is in between, so two normal parents can have a big lamb and a tiny one.

**Speed, `Nf` × `Nf`:** 75 % normal and 25 % fast (`ff`). To breed fast horses, pair two fast ones: `ff` × `ff`
always gives fast foals.

## Mutations

Copying genes is not perfect. **1 baby in 50** (2 %) is born with a **mutation**: one of its coat alleles turns into
albino `a`. The game warns you ("Something is unusual about this baby..."), but the baby usually looks normal,
because `a` is recessive: it is a carrier.

To get an **albino** (white, with pink eyes) you need two `a` alleles:

1. Raise the mutated baby (it becomes, say, `Wa`).
2. Breed it with its parent or with another carrier: with `Wa` × `Wa`, one baby in four is `aa`, albino.
3. Two albinos (`aa` × `aa`) only have albino babies.

## Trivia

- Gregor Mendel discovered these rules around 1865 by crossing **pea plants** in his monastery garden in Brno. The
  word "gene" did not exist yet: he called them "factors".
- The British geneticist Reginald Punnett came up with his square in the early 1900s.
- Real albinism also comes from a recessive allele: two parents who look normal can have an albino child.
- Real horse colours work much like this: grey is dominant and chestnut is recessive.

See also: [Breeding notebook](131), [Taming and breeding](3).
