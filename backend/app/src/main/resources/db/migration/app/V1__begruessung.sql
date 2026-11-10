create table app.begruessung (
    id smallint primary key check (id = 1),
    text text not null
);

insert into app.begruessung (id, text) values (1, 'Hallo Speaker-Tooling');
