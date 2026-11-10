# Mehrstufig: Build mit Maven Wrapper (ohne Tests, die laufen in der CI), danach Layered-JAR in ein schlankes JRE-Image.
FROM eclipse-temurin:25-jdk AS build
WORKDIR /build
COPY mvnw pom.xml ./
COPY .mvn .mvn
COPY app/pom.xml app/pom.xml
RUN chmod +x mvnw
COPY app/src app/src
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B -q -DskipTests package
RUN java -Djarmode=tools -jar app/target/app.jar extract --layers --launcher --destination /build/extracted

FROM eclipse-temurin:25-jre
RUN groupadd --system app && useradd --system --gid app --no-create-home app
WORKDIR /app
COPY --from=build /build/extracted/dependencies/ ./
COPY --from=build /build/extracted/spring-boot-loader/ ./
COPY --from=build /build/extracted/snapshot-dependencies/ ./
COPY --from=build /build/extracted/application/ ./
USER app
EXPOSE 8080
ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
