create table users (
    userid int primary key identity(1,1),
    username nvarchar(255) not null,
    email nvarchar(255) not null,
    password nvarchar(max) not null,
    userimage nvarchar(max) default 'https://cdn-icons-png.flaticon.com/512/1057/1057231.png',
    bio nvarchar(max)
);
