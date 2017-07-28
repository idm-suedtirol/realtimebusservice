'use strict';

const connection = require("../../database/database");
const logger = require("../../util/logger");

const FeatureList = require("../realtime/FeatureList");
const LineUtils = require("../line/LineUtils");

module.exports = class BusStops {

    constructor(outputFormat) {
        this.outputFormat = outputFormat;
    }

    setLines(lines) {
        this.lines = lines;
    }

    getNextStops(tripId) {
        return Promise.resolve(`
            SELECT rec_ort.onr_typ_nr,
                lid_verlauf.li_lfd_nr,
                rec_ort.ort_nr,
                rec_ort.ort_name,
                rec_ort.ort_ref_ort_name,
                COALESCE(vpa.delay_sec, 0) delay_sec,
                (departure + COALESCE(travel_time, 0) + COALESCE(delay_sec, 0)) * INTERVAL '1 sec' AS time_est,
                direction,
                ST_AsGeoJSON(rec_ort.the_geom) as json_geom
                
            FROM data.vehicle_positions vpa
            
            INNER JOIN data.rec_frt
                ON rec_frt.teq=vpa.trip
                
            INNER JOIN data.rec_lid
                ON rec_frt.line=rec_lid.line
                AND rec_frt.variant=rec_lid.variant
                
            INNER JOIN data.lid_verlauf
                ON rec_frt.line=lid_verlauf.line
                AND rec_frt.variant=lid_verlauf.variant
                AND vpa.li_lfd_nr < lid_verlauf.li_lfd_nr
                
            LEFT JOIN data.travel_times
                ON lid_verlauf.li_lfd_nr = li_lfd_nr_end
                AND travel_times.trip=rec_frt.trip
                
            LEFT JOIN data.rec_ort
                ON lid_verlauf.onr_typ_nr =  rec_ort.onr_typ_nr
                AND lid_verlauf.ort_nr = rec_ort.ort_nr
                
            WHERE rec_frt.trip = ${tripId}
            ORDER BY time_est
        `)
            .then(sql => connection.query(sql))
            .then(results => {
                let featureList = new FeatureList();

                for (let row of results.rows) {
                    let geometry = JSON.parse(row.json_geom);
                    delete row.json_geom;

                    featureList.add(row, geometry);
                }

                return featureList.getFeatureCollection()
            });
    }

    getStops() {
        return Promise.resolve(
            `SELECT rec_ort.onr_typ_nr,
                rec_ort.ort_nr,
                rec_ort.ort_name,
                rec_ort.ort_ref_ort_name,
                ST_AsGeoJSON(rec_ort.the_geom) as json_geom
            FROM  data.rec_ort `
        )
            .then(sql => {
                // noinspection EqualityComparisonWithCoercionJS
                if (this.lines != null) {
                    logger.debug(`Filter active: lines='${this.lines}'`);

                    sql +=
                        `INNER JOIN data.lid_verlauf
                                ON lid_verlauf.ort_nr=rec_ort.ort_nr
                                AND lid_verlauf.onr_typ_nr=rec_ort.onr_typ_nr
                         WHERE `;

                    sql += LineUtils.buildForSql('lid_verlauf.line', 'lid_verlauf.variant', this.lines);
                }

                return sql;
            })
            .then(sql => connection.query(sql))
            .then(result => {
                let featureList = new FeatureList();

                for (let row of result.rows) {
                    let geometry = JSON.parse(row.json_geom);
                    delete row.json_geom;

                    featureList.add(row, geometry);
                }

                return featureList.getFeatureCollection();
            });
    }
};